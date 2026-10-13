/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FRAPPE_URL?: string;
  readonly VITE_ENABLE_SOCKET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}