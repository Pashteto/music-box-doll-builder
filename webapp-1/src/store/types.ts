// Combined store shape — referenced by each slice creator for cross-slice access.
import type { CompositionSlice } from '@/store/compositionSlice'
import type { EditorSlice } from '@/store/editorSlice'
import type { EntitlementSlice } from '@/store/entitlementSlice'

export type AppState = CompositionSlice & EditorSlice & EntitlementSlice
