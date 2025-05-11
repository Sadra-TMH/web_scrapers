import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function csv_extractor() {
    const baseDir = path.join(__dirname, 'files');
    const outputFile = path.join(baseDir, 'all_company_data.csv');
    
    // Create or clear the output file
    fs.writeFileSync(outputFile, '');
    
    // Read all directories in the files folder
    const folders = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    // Flag to track if we've written headers
    let headersWritten = false;
    
    // Process each folder
    for (const folder of folders) {
        const csvPath = path.join(baseDir, folder, 'company_data.csv');
        
        // Check if the CSV file exists in this folder
        if (fs.existsSync(csvPath)) {
            const content = fs.readFileSync(csvPath, 'utf-8');
            const lines = content.split('\n');
            
            // If this is the first file, write all lines including headers
            if (!headersWritten) {
                fs.appendFileSync(outputFile, content);
                headersWritten = true;
            } else {
                // For subsequent files, skip the header line and append the rest
                const dataLines = lines.slice(1).join('\n');
                if (dataLines.trim()) {  // Only append if there's actual data
                    fs.appendFileSync(outputFile, '\n' + dataLines);
                }
            }
        }
    }
    
    console.log('CSV extraction completed. All data consolidated in all_company_data.csv');
}

// Export the function
csv_extractor();
