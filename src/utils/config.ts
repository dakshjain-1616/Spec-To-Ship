import { cleanEnv, str, port } from 'envalid';
import dotenv from 'dotenv';

dotenv.config();

export const env = cleanEnv(process.env, {
  OPENROUTER_API_KEY: str(),
  DEFAULT_MODEL: str({ default: 'google/gemini-2.0-flash-001' }),
  PORT: port({ default: 3000 }),
  DB_PATH: str({ default: 'spec-to-ship.db' }),
  OUTPUT_DIR: str({ default: 'output' }),
});
