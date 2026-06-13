import '@testing-library/jest-dom/vitest'

// Node 25 / undici's Response constructor strictly follows the Fetch spec and rejects
// null-body statuses (204, 205, 304) when a body is supplied.  In tests we want to be
// able to write `new Response('', { status: 204 })` as a readable mock, so we wrap the
// native constructor to silently normalise the body to null for those status codes.
const _NativeResponse = globalThis.Response
class _PatchedResponse extends _NativeResponse {
  constructor(body?: BodyInit | null, init?: ResponseInit) {
    const nullBodyStatuses = new Set([204, 205, 304])
    const status = init?.status ?? 200
    if (nullBodyStatuses.has(status) && (body === '' || body == null)) {
      super(null, init)
    } else {
      super(body, init)
    }
  }
}
globalThis.Response = _PatchedResponse as unknown as typeof Response
