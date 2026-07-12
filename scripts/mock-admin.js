const { createClient } = require('@supabase/supabase-js');

let deleteUserMock = null;
let lastDeletedUserId = null;
let deleteUserCallCount = 0;

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk8MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Wrap auth.admin.deleteUser with mock
  client.auth.admin.deleteUser = async (uid) => {
    deleteUserCallCount++;
    lastDeletedUserId = uid;
    if (deleteUserMock) {
      return deleteUserMock(uid);
    }
    // Return success response to mock the Auth user deletion
    return { data: { user: { id: uid } }, error: null };
  };

  return client;
}

module.exports = {
  createAdminClient,
  setDeleteUserMock: (fn) => { deleteUserMock = fn; },
  getDeleteUserCallCount: () => deleteUserCallCount,
  getLastDeletedUserId: () => lastDeletedUserId,
  resetMock: () => {
    deleteUserMock = null;
    lastDeletedUserId = null;
    deleteUserCallCount = 0;
  }
};
