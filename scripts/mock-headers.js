/**
 * Mock file for next/headers to test Supabase Server Clients in Node environment.
 */
let currentCookies = [];

module.exports = {
  cookies: async () => {
    return {
      getAll: () => currentCookies,
      get: (name) => currentCookies.find(c => c.name === name),
      set: (name, value, options) => {
        currentCookies = currentCookies.filter(c => c.name !== name);
        currentCookies.push({ name, value, ...options });
      },
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          currentCookies = currentCookies.filter(c => c.name !== name);
          currentCookies.push({ name, value, ...options });
        });
      }
    };
  },
  setMockCookies: (cookies) => {
    currentCookies = cookies;
  },
  getMockCookies: () => currentCookies
};
