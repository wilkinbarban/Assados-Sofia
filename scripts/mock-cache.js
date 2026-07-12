/**
 * Mock file for next/cache to test Next.js Server Actions in Node environment.
 */
module.exports = {
  revalidatePath: () => {
    // No-op in testing environment
  },
  revalidateTag: () => {
    // No-op in testing environment
  }
};
