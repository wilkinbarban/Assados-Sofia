/**
 * Mock file for next/server to test Next.js Middleware in Node environment.
 */

class MockCookies {
  constructor(cookies = []) {
    this.cookies = cookies;
  }
  getAll() {
    return this.cookies.map(c => ({ name: c.name, value: c.value }));
  }
  get(name) {
    const c = this.cookies.find(x => x.name === name);
    return c ? { name: c.name, value: c.value } : undefined;
  }
  set(name, value, options) {
    this.cookies = this.cookies.filter(x => x.name !== name);
    this.cookies.push({ name, value, ...options });
  }
  delete(name) {
    this.cookies = this.cookies.filter(x => x.name !== name);
  }
}

class MockResponse {
  constructor(options = {}) {
    this.status = options.status || 200;
    this.headers = new Map();
    this.cookies = new MockCookies();
    if (options.url) {
      this.headers.set('location', options.url);
      this.redirectedUrl = options.url;
    }
  }
}

module.exports = {
  NextResponse: {
    next: (options) => {
      const resp = new MockResponse();
      if (options && options.request && options.request.cookies) {
        resp.cookies.cookies = [...options.request.cookies.cookies];
      }
      return resp;
    },
    redirect: (url) => {
      return new MockResponse({ status: 307, url: url.toString() });
    }
  },
  NextRequest: class {
    constructor(urlStr, options = {}) {
      this.url = urlStr;
      this.nextUrl = new URL(urlStr);
      this.cookies = new MockCookies(options.cookies || []);
    }
  }
};
