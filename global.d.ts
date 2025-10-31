// global.d.ts

// Declare the custom global variables that your build process injects.
// The 'const' usage in your file implies they are not on the 'window' 
// object, but are true global constants injected by a bundler plugin.
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | null | undefined;