'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  Auth
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  Timestamp,
  Firestore
} from 'firebase/firestore';

// --- Global Variable Type Declarations (Fixes "Cannot find name '__app_id'" error) ---
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | null | undefined;

// --- Global Variable Access (MANDATORY) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : { /* placeholder config */ };
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- LOCAL STORAGE CONSTANT ---
const LOCAL_STORAGE_KEY = 'flux_prompt_generator_state'; 

// --- SCHEMA & TYPE DEFINITIONS ---

// Define a type for the potentially nested structure of form data
interface DetailFields {
  [key: string]: string | string[] | DetailFields;
}

interface FormDataType {
  subject: {
    character_description: string;
    age_range: string;
    gender: string;
    ethnicity: string;
    body_type: string;
    pose: string;
  };
  costume: {
    period: string;
    style: string;
    color_palette: string[]; 
    upper_body: {
      garment_type: string;
      material: string;
      details: string;
    };
    lower_body: {
      garment_type: string;
      material: string;
      details: string;
    };
    footwear: {
      type: string;
    };
    accessories: string; // Comma-separated string
    hair_makeup: {
      hairstyle: string;
      hair_color: string;
      makeup_style: string;
    };
  };
  technical_specs: {
    camera_type: string;
    camera_model: string;
    lens: {
      focal_length: string;
      aperture: string;
      type: string;
    };
    lighting_setup: {
      style: string;
      key_light: string;
      fill_light: string;
      background_light: string;
    };
    background: {
      type: string;
      color: string;
      texture: string;
      environment: string;
    };
  };
  cinematic_style: {
    genre: string;
    mood: string;
    color_grading: string;
    reference_style: string;
    composition: string;
    angle: string;
  };
  quality_settings: {
    resolution: string;
    detail_level: string;
    negative_prompts: string[]; 
  };
}

interface DropdownOptionsType {
  [key: string]: string[];
}

// Hardcoded schema structure for form generation and default values
const initialFormData: FormDataType = {
  subject: {
    character_description: '',
    age_range: '30s',
    gender: 'female',
    ethnicity: 'white',
    body_type: 'average',
    pose: 'standing',
  },
  costume: {
    period: '',
    style: '',
    color_palette: ['black', 'silver', 'red'], 
    upper_body: {
      garment_type: '',
      material: '',
      details: '',
    },
    lower_body: {
      garment_type: 'mini skirt',
      material: '',
      details: '',
    },
    footwear: {
      type: 'stilettos',
    },
    accessories: '', // Comma-separated string
    hair_makeup: {
      hairstyle: 'mid-length hair',
      hair_color: 'black',
      makeup_style: 'natural',
    },
  },
  technical_specs: {
    camera_type: 'film camera',
    camera_model: 'Leica M6',
    lens: {
      focal_length: '50mm',
      aperture: 'f/1.4',
      type: 'prime',
    },
    lighting_setup: {
      style: 'Rembrandt',
      key_light: 'beauty dish on the right',
      fill_light: 'softbox on the left',
      background_light: 'ring light behind the girl',
    },
    background: {
      type: 'photo shoot',
      color: 'light grey',
      texture: 'weathered',
      environment: 'photo studio',
    },
  },
  cinematic_style: {
    genre: 'action',
    mood: 'cinematic',
    color_grading: 'warm tones',
    reference_style: "70's movie",
    composition: 'full body',
    angle: 'low level',
  },
  quality_settings: {
    resolution: 'magazine quality',
    detail_level: 'photorealistic',
    negative_prompts: ['blurry', 'low quality', 'distorted', 'amateur', 'overexposed'], 
  },
};

/**
 * Safely gets a deeply nested value from an object using a dot-separated path.
 * @param obj The object to search (typed as any for generality across the complex structure).
 * @param path The dot-separated path string (e.g., 'costume.hair_makeup.hairstyle').
 * @returns The value at the path, or undefined.
 */
const getPath = (obj: FormDataType | DetailFields, path: string): any => 
  path.split('.').reduce((o: any, i) => (o ? o[i] : undefined), obj);

/**
 * Safely sets a deeply nested value in an object using a dot-separated path, returning a new object (immutable update).
 * @param obj The source object.
 * @param path The dot-separated path string.
 * @param value The new value to set.
 * @returns A new object with the updated value.
 */
const setPath = (obj: FormDataType, path: string, value: any): FormDataType => {
  const newObj = { ...obj } as any; // Cast to any internally for mutable pointer traversal
  const parts = path.split('.');
  let current = newObj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === parts.length - 1) {
      current[part] = value;
    } else {
      // Use spread to ensure deep immutability
      current[part] = { ...current[part] };
      current = current[part];
    }
  }
  return newObj as FormDataType; // Return the strongly typed object
};

// --- CORE APP COMPONENT ---

const App = () => {
  // Apply FormDataType to the main state
  const [formData, setFormData] = useState<FormDataType>(initialFormData);
  // Apply DropdownOptionsType
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOptionsType>({});
  
  const [db, setDb] = useState<Firestore | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing...');
  const [persistenceMode, setPersistenceMode] = useState<'firestore' | 'local'>('firestore');
  const [newAccessorySelection, setNewAccessorySelection] = useState<string>('');

  // Ollama state
  const [ollamaModel, setOllamaModel] = useState<string>('llama3.2');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [ollamaEndpoint] = useState<string>('http://localhost:11434');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFieldPathRef = useRef<string | null>(null);

  // --- FIREBASE INITIALIZATION & FALLBACK (useEffect 1: Init & Auth) ---
  useEffect(() => {
    // Helper function to handle fallback to local storage mode
    const fallbackToLocal = (message: string) => {
      setPersistenceMode('local');
      setUserId(crypto.randomUUID());
      setAuthReady(true);
      setStatusMessage(message);
    };

    try {
      if (!firebaseConfig || !firebaseConfig.projectId) {
        fallbackToLocal('Warning: Firebase config invalid. Using Local Storage & temporary ID.');
        return; 
      }
      
      setPersistenceMode('firestore');
      
      const app = initializeApp(firebaseConfig as Record<string, any>);
      const firestore = getFirestore(app);
      const auth = getAuth(app);
      setDb(firestore);

      onAuthStateChanged(auth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setStatusMessage('Authenticated. Loading data from Firestore...');
          setAuthReady(true);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(auth, initialAuthToken);
            } else {
              await signInAnonymously(auth);
            }
          } catch (error) {
            console.error('Firebase Auth Error:', error);
            fallbackToLocal('Failed to authenticate. Using temporary ID.');
          }
        }
      });
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      fallbackToLocal('Error: Firebase failed to initialize. Using Local Storage.');
    }
  }, []);

  // --- PERSISTENCE SAVE FUNCTION (Firestore or Local Storage) ---
  const firestoreDataPath = `/artifacts/${appId}/users/${userId}/app_data/costume_generator_state`;

  const saveToPersistence = useCallback(async (dataToSave: FormDataType, optionsToSave: DropdownOptionsType) => {
    const saveData = {
        formData: dataToSave,
        dropdownOptions: optionsToSave,
    };
    
    if (persistenceMode === 'firestore') {
      if (!db || !userId) return;
      try {
        const docRef = doc(db, firestoreDataPath);
        await setDoc(docRef, { 
          ...saveData, 
          timestamp: Timestamp.now() 
        });
      } catch (error) {
        console.error('Error saving data to Firestore:', error);
      }
    } else { // 'local' storage mode
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
            ...saveData,
            timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error('Error saving data to Local Storage:', error);
      }
    }
  }, [db, userId, persistenceMode, firestoreDataPath]);


  // --- PERSISTENCE DATA LOAD (useEffect 2: Load Data) ---
  const loadData = useCallback(async () => {
      if (!authReady) return;

      let dataToRestore: FormDataType | null = null;
      let restoredOptions: DropdownOptionsType = {};
      
      if (persistenceMode === 'firestore') {
        if (!db || !userId) return;
        
        try {
          const docRef = doc(db, firestoreDataPath);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            dataToRestore = data.formData as FormDataType;
            restoredOptions = (data.dropdownOptions || {}) as DropdownOptionsType;
            setStatusMessage('Data loaded successfully from Firestore!');
          } else {
            await setDoc(docRef, { 
              formData: initialFormData, 
              dropdownOptions: {}, 
              timestamp: Timestamp.now() 
            });
            setStatusMessage('Default data initialized and saved to Firestore.');
            dataToRestore = initialFormData;
          }
        } catch (error) {
          console.error('Error loading or initializing data from Firestore:', error);
          setStatusMessage('Error loading data from Firestore. Check console.');
          dataToRestore = initialFormData;
        }
      } else { // 'local' storage mode
        try {
          const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (localData) {
            const data = JSON.parse(localData);
            dataToRestore = data.formData as FormDataType;
            restoredOptions = (data.dropdownOptions || {}) as DropdownOptionsType;
            setStatusMessage('Data loaded successfully from Local Storage (Non-persistent environment).');
          } else {
            const defaultSaveData = { 
                formData: initialFormData, 
                dropdownOptions: {}, 
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaultSaveData));
            setStatusMessage('Default data initialized and saved to Local Storage.');
            dataToRestore = initialFormData;
          }
        } catch (error) {
          console.error('Error loading data from Local Storage:', error);
          setStatusMessage('Error accessing Local Storage.');
          dataToRestore = initialFormData;
        }
      }
      
      setFormData(dataToRestore || initialFormData);
      setDropdownOptions(restoredOptions);
      if (restoredOptions['costume.accessories'] && restoredOptions['costume.accessories'].length > 0) {
        setNewAccessorySelection(restoredOptions['costume.accessories'][0]);
      }
  }, [authReady, db, userId, persistenceMode, firestoreDataPath]); 

  
  useEffect(() => {
    loadData();
  }, [loadData]);


  // Debounce effect for saving formData 
  useEffect(() => {
    if (!authReady) return;
    const handler = setTimeout(() => {
      saveToPersistence(formData, dropdownOptions);
    }, 500);

    return () => clearTimeout(handler);
  }, [formData, dropdownOptions, authReady, saveToPersistence]);


  // --- HANDLERS ---

  const handleResetLocalStorage = (): void => {
    if (persistenceMode !== 'local') {
      setStatusMessage('Reset only available in Local Storage mode.');
      return;
    }

    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setFormData(initialFormData);
      setDropdownOptions({});
      setNewAccessorySelection('');
      setStatusMessage('Local Storage cleared and form reset to defaults!');
    } catch (error) {
      console.error('Error resetting Local Storage:', error);
      setStatusMessage('Error resetting Local Storage. Check console.');
    }
  };

  const handleInputChange = (path: string, value: string): void => {
    setFormData(prev => setPath(prev, path, value));
  };

  const handleAddAccessory = (path: string, newAccessory: string): void => {
    const trimmedAccessory = newAccessory.trim();
    if (!trimmedAccessory) return;

    setFormData(prev => {
      const currentList = getPath(prev, path) as string | undefined;
      let newList;

      if (currentList && currentList.trim().length > 0) {
        newList = currentList.trim().replace(/,$/, '') + ', ' + trimmedAccessory;
      } else {
        newList = trimmedAccessory;
      }
      return setPath(prev, path, newList);
    });
  };
  
  const handleArrayChange = (path: string, text: string): void => {
    const value = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    setFormData(prev => setPath(prev, path, value));
  };
  
  const handleLoadFileClick = (fieldPath: string): void => {
    if (fileInputRef.current) {
      currentFieldPathRef.current = fieldPath;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    const fieldPath = currentFieldPathRef.current;

    if (!file || !fieldPath) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      const newOptions = { ...dropdownOptions, [fieldPath]: lines };
      setDropdownOptions(newOptions);
      
      if (lines.length > 0) {
        if (fieldPath === 'costume.accessories') {
          setNewAccessorySelection(lines[0]);
        } else {
          handleInputChange(fieldPath, lines[0]);
        }
      }
      
      saveToPersistence(formData, newOptions);
      
      // Reset the input value
      event.target.value = '';
    };
    reader.onerror = () => {
      setStatusMessage('Error reading file.');
    };

    reader.readAsText(file);
  };
  
  const handleCopyJson = (): void => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = JSON.stringify(formData, null, 2);
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setStatusMessage('JSON copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy JSON:', error);
      setStatusMessage('Error: Failed to copy JSON.');
    }
  };

  const handleDownloadJson = (): void => {
    try {
      const generatedJsonString = JSON.stringify(formData, null, 2);
      const blob = new Blob([generatedJsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prompt_data.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMessage('JSON file (prompt_data.json) downloaded!');
    } catch (error) {
      console.error('Failed to download JSON:', error);
      setStatusMessage('Error: Failed to download JSON.');
    }
  };

  // --- OLLAMA FUNCTIONS ---

  const fetchAvailableModels = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${ollamaEndpoint}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Ollama models');
      }

      const data = await response.json();
      const models = data.models?.map((m: any) => m.name) || [];

      setAvailableModels(models);

      // Set default model if available
      if (models.length > 0 && !models.includes(ollamaModel)) {
        setOllamaModel(models[0]);
      }

      setOllamaError(null);
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      setOllamaError('Ollama is not running. Please start Ollama and try again.');
      setAvailableModels([]);
    }
  }, [ollamaEndpoint, ollamaModel]);

  const generatePromptWithOllama = async (): Promise<void> => {
    if (!ollamaModel) {
      setOllamaError('Please select an Ollama model first.');
      return;
    }

    setIsGenerating(true);
    setOllamaError(null);

    try {
      const systemPrompt = `You are an AI assistant that converts structured costume and photography data into natural language prompts optimized for image generation AI systems like Stable Diffusion and ComfyUI.

Your task:
1. Read the JSON data below
2. Create a cohesive, flowing natural language description
3. Include ALL technical details (camera, lighting, costume elements)
4. Write in a descriptive, visual style
5. Output a single paragraph or comma-separated descriptive prompt

Rules:
- Start with the subject description
- Describe the costume in detail (period, style, materials, colors)
- Include all accessories and styling details
- Incorporate technical photography specs naturally
- End with cinematic style and quality parameters
- Do not use JSON formatting in the output
- Create a prompt ready to paste into ComfyUI

JSON Data:
${JSON.stringify(formData, null, 2)}

Generate the natural language prompt:`;

      const response = await fetch(`${ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: systemPrompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      const generatedText = data.response || '';

      setGeneratedPrompt(generatedText.trim());
      setOllamaError(null);
      setStatusMessage('Natural language prompt generated successfully!');
    } catch (error: any) {
      console.error('Error generating prompt:', error);

      if (error.message.includes('fetch')) {
        setOllamaError('Ollama is not running. Please start Ollama and try again.');
      } else if (error.message.includes('404')) {
        setOllamaError(`Model '${ollamaModel}' not found. Please select another model.`);
      } else if (error.message.includes('timeout')) {
        setOllamaError('Request timeout. The model may be loading or unavailable.');
      } else {
        setOllamaError('Failed to generate prompt. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = (): void => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = generatedPrompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setStatusMessage('Natural language prompt copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy prompt:', error);
      setStatusMessage('Error: Failed to copy prompt.');
    }
  };

  // Load available models when auth is ready
  useEffect(() => {
    if (authReady) {
      fetchAvailableModels();
    }
  }, [authReady, fetchAvailableModels]);

  // --- FORM RENDERING LOGIC ---

  const renderField = (key: string, value: any, parentPath: string = '') => {
    const currentPath = parentPath ? `${parentPath}.${key}` : key;
    const title = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const isCharacterDescription = key === 'character_description';
    const isAccessoriesField = currentPath === 'costume.accessories';

    // 1. Array Handling
    if (Array.isArray(value)) {
      const arrayText = value.join('\n');
      return (
        <div key={currentPath} className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">{title}</label>
          <textarea
            className="w-full p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400 min-h-[100px]"
            value={arrayText}
            onChange={(e) => handleArrayChange(currentPath, e.target.value)}
            placeholder={`Enter one ${key} item per line...`}
          />
          <span className="text-xs text-gray-500">Enter one item per line.</span>
        </div>
      );
    }

    // 2. Nested Object Handling
    if (typeof value === 'object' && value !== null) {
      return (
        <div key={currentPath} className="space-y-4 p-4 mt-2 border border-gray-200 rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-700 border-b border-gray-300 pb-1">{title}</h3>
          {Object.entries(value).map(([subKey, subValue]) => renderField(subKey, subValue, currentPath))}
        </div>
      );
    }

    // 3. Simple String Field
    if (typeof value === 'string') {
      const options = dropdownOptions[currentPath];
      const isDropdown = options && options.length > 0;
      
      // Case 3a: Character Description (editable textarea)
      if (isCharacterDescription) {
        return (
          <div key={currentPath} className="mb-4">
            <label className="block text-sm font-medium text-gray-600 mb-1">{title}</label>
            <textarea
              className="w-full p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400 min-h-[80px]"
              value={value}
              onChange={(e) => handleInputChange(currentPath, e.target.value)}
              placeholder="Describe the subject here..."
            />
          </div>
        );
      }

      // Case 3b: Accessories Field (Custom Add UI)
      if (isAccessoriesField) {
        return (
          <div key={currentPath} className="mb-4">
            <label className="block text-sm font-medium text-gray-600 mb-1">{title} (Comma-Separated List)</label>

            <div className="mb-3 p-3 border border-gray-300 rounded-md bg-gray-50 text-sm text-gray-700 min-h-[40px] break-words font-mono">
              {value || 'No accessories added.'}
            </div>

            <div className="flex space-x-2 mb-2">
              {isDropdown ? (
                <select
                  className="flex-grow p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                  value={newAccessorySelection || (options.length > 0 ? options[0] : '')}
                  onChange={(e) => setNewAccessorySelection(e.target.value)}
                  disabled={options.length === 0}
                >
                  {options.map((option, index) => (
                    <option key={index} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="flex-grow p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                  value={newAccessorySelection}
                  onChange={(e) => setNewAccessorySelection(e.target.value)}
                  placeholder="Type or select new accessory"
                />
              )}

              <button
                type="button"
                onClick={() => {
                  const accessoryToAdd = isDropdown
                    ? (newAccessorySelection || options[0])
                    : newAccessorySelection;
                  handleAddAccessory(currentPath, accessoryToAdd);
                  if (!isDropdown) setNewAccessorySelection('');
                }}
                className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 transition duration-150 ease-in-out shadow-sm flex items-center justify-center"
                title="Add accessory to list"
                disabled={!isDropdown && newAccessorySelection.trim() === ''}
              >
                Add
              </button>

              <button
                type="button"
                onClick={() => handleLoadFileClick(currentPath)}
                className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition duration-150 ease-in-out shadow-sm flex items-center justify-center"
                title="Load custom list from .txt file"
              >
                Load List
              </button>
            </div>

            <button
                type="button"
                onClick={() => handleInputChange(currentPath, '')}
                className="mt-2 px-3 py-1.5 text-xs bg-gray-500 text-white rounded-md hover:bg-gray-600 transition duration-150 ease-in-out shadow-sm flex items-center justify-center w-full"
                title="Clear all accessories"
            >
              Clear All Accessories
            </button>
          </div>
        );
      }
      
      // Case 3c: Standard String Field (Dropdown or Input with Load button)
      return (
        <div key={currentPath} className="mb-4">
          <label className="block text-sm font-medium text-gray-600 mb-1">{title}</label>
          <div className="flex space-x-2">
            {isDropdown ? (
              <select
                className="flex-grow p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                value={value}
                onChange={(e) => handleInputChange(currentPath, e.target.value)}
              >
                {options.map((option, index) => (
                  <option key={index} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="flex-grow p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
                value={value}
                onChange={(e) => handleInputChange(currentPath, e.target.value)}
                placeholder={`Enter value for ${title}`}
              />
            )}

            <button
              type="button"
              onClick={() => handleLoadFileClick(currentPath)}
              className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition duration-150 ease-in-out shadow-sm flex items-center justify-center"
              title="Load custom list from .txt file"
            >
              Load List
            </button>
          </div>
          {isDropdown && (
            <span className="text-xs text-gray-500">Using custom list from loaded file.</span>
          )}
        </div>
      );
    }

    return null;
  };
  
  // --- RENDER ---
  
  const generatedJson = JSON.stringify(formData, null, 2);

  return (
    <div className="min-h-screen bg-white text-gray-900 p-4 sm:p-8 font-inter">
      {/* Hidden file input for loading lists */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".txt"
        className="hidden"
      />

      <header className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Flux Prompt Generator</h1>
        <p className="text-gray-600">{statusMessage}</p>
        <p className="text-xs text-gray-500 mt-1">
          User ID: {userId || 'N/A'} | Persistence: <span className={`font-semibold ${persistenceMode === 'local' ? 'text-gray-700' : 'text-gray-800'}`}>{persistenceMode.toUpperCase()}</span>
        </p>
      </header>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* LEFT COLUMN: FORM */}
        <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">Configuration Form</h2>
          <form className="space-y-6">
            {Object.entries(formData).map(([key, value]) => (
              <div key={key} className="p-4 border border-gray-200 rounded-lg bg-white">
                <h2 className="text-xl font-bold text-gray-700 mb-3 uppercase tracking-wider">{key.replace(/_/g, ' ')}</h2>
                {renderField(key, value)}
              </div>
            ))}
          </form>
        </div>

        {/* RIGHT COLUMN: OLLAMA PROMPT & JSON OUTPUT */}
        <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">AI Prompt Generation</h2>

          {/* OLLAMA CONTROLS */}
          <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Ollama LLM Settings</h3>

            <div className="flex space-x-3 mb-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-600 mb-1">Model</label>
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  disabled={availableModels.length === 0 || isGenerating}
                  className="w-full p-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400 disabled:opacity-50 disabled:bg-gray-100"
                >
                  {availableModels.length === 0 ? (
                    <option value="">No models available</option>
                  ) : (
                    availableModels.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={generatePromptWithOllama}
                  disabled={isGenerating || availableModels.length === 0}
                  className="px-6 py-2 text-sm font-semibold bg-gray-800 text-white rounded-md hover:bg-gray-900 transition duration-150 ease-in-out shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Generate natural language prompt using Ollama"
                >
                  {isGenerating ? 'Generating...' : 'Generate Prompt'}
                </button>
              </div>
            </div>

            {/* Error Display */}
            {ollamaError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                <strong>Error:</strong> {ollamaError}
              </div>
            )}

            {/* Loading Indicator */}
            {isGenerating && (
              <div className="p-3 bg-gray-100 border border-gray-300 rounded-md text-sm text-gray-700">
                Generating prompt with {ollamaModel}... This may take a moment.
              </div>
            )}
          </div>

          {/* NATURAL LANGUAGE PROMPT SECTION */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-700">Generated Natural Language Prompt</h3>
              {generatedPrompt && (
                <span className="text-xs text-gray-500">
                  {generatedPrompt.split(' ').length} words
                </span>
              )}
            </div>

            <textarea
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              placeholder="Click 'Generate Prompt' to create a natural language prompt from your costume data..."
              className="w-full p-4 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-gray-400 focus:border-gray-400 font-mono text-sm min-h-[200px] resize-y"
            />

            {generatedPrompt && (
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="mt-2 w-full px-4 py-2 text-sm font-semibold bg-gray-700 text-white rounded-md hover:bg-gray-800 transition duration-150 ease-in-out shadow-sm"
                title="Copy natural language prompt to clipboard"
              >
                Copy Prompt to Clipboard
              </button>
            )}
          </div>

          {/* JSON OUTPUT SECTION */}
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Structured JSON Data</h3>

            {/* Action Buttons: Copy, Download, and Reset Button */}
            <div className="flex space-x-4 mb-4">
              <button
                type="button"
                onClick={handleCopyJson}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-gray-600 text-white rounded-md hover:bg-gray-700 transition duration-150 ease-in-out shadow-sm"
                title="Copy the formatted JSON to your clipboard"
              >
                Copy JSON
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-gray-600 text-white rounded-md hover:bg-gray-700 transition duration-150 ease-in-out shadow-sm"
                title="Download the JSON data as 'prompt_data.json'"
              >
                Download JSON (.json)
              </button>

              {/* RESET BUTTON */}
              {persistenceMode === 'local' && (
                <button
                  type="button"
                  onClick={handleResetLocalStorage}
                  className="flex-1 px-4 py-2 text-sm font-semibold bg-gray-500 text-white rounded-md hover:bg-gray-600 transition duration-150 ease-in-out shadow-sm"
                  title="Clear all saved data from Local Storage and reset form."
                >
                  Reset Local State
                </button>
              )}
            </div>

            <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-sm text-gray-800 border border-gray-200 max-h-[40vh] w-full font-mono">
              {generatedJson}
            </pre>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default App;
