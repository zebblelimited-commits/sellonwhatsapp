import { defineConfig } from '@prisma/config';
import 'dotenv/config'; // Loads .env variables into process.env

export default defineConfig({
    datasource: {
        url: process.env.DATABASE_URL || '',
    },
});