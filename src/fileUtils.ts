import fs from 'fs/promises';
import path from 'path';
import { Credentials } from './utils.js';

export const FILE_DIR_PREFIX = "src/files/";
export const CREDENTIALS_FILE = "credentials.json";

/**
 * Ensures the directory exists, creating it if necessary
 * @param filePath Path to check/create directory for
 */
async function ensureDirectoryExists(filePath: string) {
    const directory = path.dirname(filePath);
    try {
        await fs.access(directory);
    } catch {
        await fs.mkdir(directory, { recursive: true });
    }
}

/**
 * Reads JSON data from a file
 * @param filePath Path to the file
 * @returns Parsed JSON data or null if operation fails
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
        await ensureDirectoryExists(filePath);
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error(`Error reading file ${filePath}:`, error);
        }
        return null;
    }
}

/**
 * Writes JSON data to a file
 * @param filePath Path to the file
 * @param data Data to write
 * @returns true if successful, false otherwise
 */
export async function writeJsonFile<T>(filePath: string, data: T): Promise<boolean> {
    try {
        await ensureDirectoryExists(filePath);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing to file ${filePath}:`, error);
        return false;
    }
}

/**
 * Writes raw data to a file
 * @param filePath Path to the file
 * @param data Data to write
 * @param encoding Optional encoding (defaults to utf-8)
 * @returns true if successful, false otherwise
 */
export async function writeFile(filePath: string, data: string, encoding: BufferEncoding = 'utf-8'): Promise<boolean> {
    try {
        await ensureDirectoryExists(filePath);
        await fs.writeFile(filePath, data, encoding);
        return true;
    } catch (error) {
        console.error(`Error writing to file ${filePath}:`, error);
        return false;
    }
}

/**
 * Saves credentials to the credentials file
 * @param url URL associated with the credentials
 * @param newData New credential data to save
 * @returns true if successful, false otherwise
 */
export async function saveCredentials(url: string, newData: any): Promise<boolean> {
    try {
        const credentialsPath = FILE_DIR_PREFIX + CREDENTIALS_FILE;
        await ensureDirectoryExists(credentialsPath);
        
        // Read existing data
        let existingData: Credentials = {};
        const existingCredentials = await readJsonFile<Credentials>(credentialsPath);
        if (existingCredentials) {
            existingData = existingCredentials;
        }

        // Merge existing data with new data
        const updatedData = {
            ...existingData,
            [url]: {
                ...existingData[url],
                ...newData,
                formData: {
                    ...existingData[url]?.formData,
                    ...newData.formData,
                },
            },
        };

        return await writeJsonFile(credentialsPath, updatedData);
    } catch (error) {
        console.error("Error saving credentials:", error);
        return false;
    }
}

/**
 * Loads credentials from the credentials file
 * @returns Credentials object or null if operation fails
 */
export async function loadCredentials(): Promise<Credentials | null> {
    const credentialsPath = FILE_DIR_PREFIX + CREDENTIALS_FILE;
    return await readJsonFile<Credentials>(credentialsPath);
} 