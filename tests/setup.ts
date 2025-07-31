import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock environment variables for testing
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';
process.env.NTFY_TOPIC = process.env.NTFY_TOPIC || 'test-topic';
process.env.NTFY_SERVER = process.env.NTFY_SERVER || 'https://ntfy.sh';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Global test timeout
jest.setTimeout(30000);