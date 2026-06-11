import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Bridge Next 15's legacy (eslintrc-style) shareable configs into ESLint 9 flat config.
const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // Turn off ESLint rules that conflict with Prettier formatting.
  ...compat.extends('prettier'),
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**', 'public/**'],
  },
]

export default eslintConfig
