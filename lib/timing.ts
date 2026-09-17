/** Promise-based sleep, shared by the login choreography and its intro. */
export const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration))
