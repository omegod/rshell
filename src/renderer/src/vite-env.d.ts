/// <reference types="vite/client" />

import { RShellApi } from '../../shared/types'

declare global {
  interface Window {
    api: RShellApi
  }
}

export {}
