import fs from "fs/promises";
import * as cheerio from "cheerio";
import { writeJsonFile, saveCredentials } from "./fileUtils";
import { FILE_DIR_PREFIX } from "./fileUtils";
import axios from "axios";
import FormData from "form-data";

// URLs
export const baseUrl = "https://rrk.ir";
export const searchPage = `${baseUrl}/ords/r/rrs/rrs-front/big_data11`;
export const searchUrl = `${baseUrl}/ords/wwv_flow.accept?p_context=rrs-front/big_data11/`;
export const ajaxUrl = `${baseUrl}/ords/wwv_flow.ajax?p_context=rrs-front/big_data11/`;
export const homeUrl = `${baseUrl}/ords/r/rrs/rrs-front/home`;
// File paths
export const CREDENTIALS_FILE = "credentials.json";

// Common Headers
export const COMMON_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    Host: "rrk.ir",
    Connection: "keep-alive",
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
};

// Additional Headers
export const CACHE_HEADERS = {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
};

export const POST_HEADERS = {
    Origin: baseUrl,
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Referer: baseUrl,
};

export interface FormDataCredentials {
    flowId?: string;
    flowStepId?: string;
    instance?: string;
    pageSubmissionId?: string;
    salt?: string;
    protected?: string;
    pageItemsRowVersion?: string;
    orderPrice?: string;
    banner?: string;
    linkBanner?: string;
    currentDate?: string;
    mt?: string;
    pPageItemsProtected?: string;
    tooltipBanner?: { value?: string; ck?: string };
    currentPageId?: { value?: string; ck?: string };
    orderId?: { value?: string; ck?: string };
    gridConfig?: {
        reportId: string;
        view: string;
        ajaxColumns: string[];
        id: string;
        ajaxIdentifier: string;
    };
    ajaxIdentifiers: {
        [key: string]: string;
    };
}

export interface UrlCredentials {
    cookies?: string;
    formData?: FormDataCredentials;
}

export interface Credentials {
    [url: string]: UrlCredentials;
}

export async function extractFormCredentials(
    html: string
): Promise<FormDataCredentials> {
    const credentials: FormDataCredentials = {
        ajaxIdentifiers: {},
    };
    const $ = cheerio.load(html);

    // Helper function to get input value
    const getValue = (selector: string): string | undefined => {
        return $(selector).val()?.toString();
    };

    // Extract values using Cheerio selectors
    credentials.flowId = getValue('input[name="p_flow_id"]');
    credentials.flowStepId = getValue('input[name="p_flow_step_id"]');
    credentials.instance = getValue('input[name="p_instance"]');
    credentials.pageSubmissionId = getValue(
        'input[name="p_page_submission_id"]'
    );
    credentials.salt = getValue("#pSalt");
    credentials.pageItemsRowVersion = getValue(
        'input[name="pPageItemsRowVersion"]'
    );
    credentials.orderPrice = getValue('input[name="P0_ORDER_PRICE"]');
    credentials.banner = getValue('input[name="P0_BANNER"]');
    credentials.linkBanner = getValue('input[name="P0_LINK_BANNER"]');
    credentials.currentDate = getValue('input[name="P0_CURRENTDATE"]');
    credentials.mt = getValue('input[name="P0_MT"]');

    credentials.pPageItemsProtected = getValue("#pPageItemsProtected");

    credentials.currentPageId = {
        value: getValue('input[name="P0_CURRENT_PAGE_ID"]'),
        ck: getValue('input[data-for="P0_CURRENT_PAGE_ID"]'),
    };
    credentials.orderId = {
        value: getValue('input[name="P0_ORDER_ID"]'),
        ck: getValue('input[data-for="P0_ORDER_ID"]'),
    };
    credentials.tooltipBanner = {
        value: getValue('input[name="P0_TOOLTIP_BANNER"]'),
        ck: getValue('input[data-for="P0_TOOLTIP_BANNER"]'),
    };

    // Extract grid configuration and ajax identifiers
    try {
        // Extract grid configuration from script tag
        const scriptContent = $('script:contains("interactiveGrid")').text();
        if (scriptContent) {
            const configMatch = scriptContent.match(
                /interactiveGrid\((.*?)\);/s
            );
            if (configMatch) {
                const configStr = configMatch[1];
                const config = JSON.parse(configStr);
                if (config?.config?.regionId && config?.savedReports?.[0]) {
                    credentials.gridConfig = {
                        reportId: config.savedReports[0].id,
                        view: "grid",
                        ajaxColumns: config.config.ajaxColumns,
                        id: config.config.regionId,
                        ajaxIdentifier: config.config.ajaxIdentifier,
                    };
                }
            }
        }

        // Find the script containing the event list initialization

        const eventListScript = $(
            'script:contains("apex.da.initDaEventList")'
        ).html();

        if (eventListScript) {
            try {
                const eventListMatch = eventListScript.match(
                    /apex\.da\.gEventList\s*=\s*(\[.*?\]);/s
                );

                if (eventListMatch && eventListMatch[1]) {
                    const eventListStr = eventListMatch[1];

                    try {
                        // Extract AJAX identifiers directly using regex instead of parsing JSON
                        const ajaxIdentifierRegex = /"affectedElements"\s*:\s*"([^"]+)"[^}]*"ajaxIdentifier"\s*:\s*"([^"]+)"/g;
                        
                        let match;
                        while ((match = ajaxIdentifierRegex.exec(eventListStr)) !== null) {
                            const element = match[1];
                            const identifier = match[2];
                            
                            if (element && identifier) {
                                credentials.ajaxIdentifiers[element] = identifier;
                            }
                        }
                        
                        // Also look for triggering elements
                        const triggerRegex = /"triggeringElement"\s*:\s*"([^"]+)"[^}]*"ajaxIdentifier"\s*:\s*"([^"]+)"/g;
                        
                        while ((match = triggerRegex.exec(eventListStr)) !== null) {
                            const element = match[1];
                            const identifier = match[2];
                            
                            if (element && identifier) {
                                credentials.ajaxIdentifiers[element] = parseEncodedString(identifier);
                            }
                        }
                        
                    } catch (error) {
                        console.error("Error extracting AJAX identifiers:", error);
                    }
                }
            } catch (error) {
                console.error("Error processing event list:", error);
            }
        }
    } catch (error) {
        console.error("Error during extraction:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }

    return credentials;
}

/**
 * Properly parses a JSON string that contains escaped unicode sequences
 * @param encodedString The string to parse
 * @returns The properly decoded string
 */
function parseEncodedString(encodedString: string): string {
  // Replace \\u002F with / (forward slash)
  // JSON.parse will handle the rest of the unicode escapes
  const preparedString = encodedString.replace(/\\u002F/g, '/');
  
  // Use JSON.parse to properly handle the escaped characters
  // We need to wrap it in quotes to make it a valid JSON string
  try {
    return JSON.parse(`"${preparedString}"`);
  } catch (error) {
    console.error('Error parsing encoded string:', error);
    return encodedString; // Return original if parsing fails
  }
}

/**
 * Common interface for AJAX request parameters
 */
export interface AjaxRequestParams {
    searchQuery?: string;
    getElement: (flowStepId: string) => string;
    getAdditionalItems: (flowStepId: string) => Array<{
        name: string;
        value: string;
    }>;
}

/**
 * Handles common AJAX flow operations
 */
export async function handleAjaxFlow({
    searchQuery = "",
    getElement,
    getAdditionalItems = () => []
}: AjaxRequestParams) {
    try {

        // Get credentials - either load existing or fetch new ones
        const credentials = await loadCredentials();
        let cookies = credentials?.[searchPage]?.cookies;

        if (!cookies) {
            console.log("No existing cookies found, fetching new ones...");
            cookies = await getInitialCookies();
        }

        const formCredentials = credentials?.[searchPage]?.formData;
        if (!formCredentials) {
            throw new Error("No form credentials found");
        }
        const elementId = getElement(formCredentials.flowStepId || "");
        const additionalItems = getAdditionalItems(formCredentials.flowStepId || "");
        // Create FormData instance
        const formData = new FormData();
        formData.append("p_flow_id", formCredentials.flowId || "");
        formData.append("p_flow_step_id", formCredentials.flowStepId || "");
        formData.append("p_instance", formCredentials.instance || "");
        formData.append("p_debug", "");

        const ajaxIdentifier = formCredentials.ajaxIdentifiers?.[elementId];
        if (!ajaxIdentifier) {
            throw new Error(`No AJAX identifier found for element: ${elementId}`);
        }

        formData.append("p_request", `PLUGIN=${ajaxIdentifier}`);

        // Prepare the JSON payload
        const itemsToSubmit = [
            ...additionalItems,
        ].map(item => ({
            n: item.name,
            v: item.value
        }));

        const jsonPayload = {
            pageItems: {
                itemsToSubmit,
                protected: formCredentials.pPageItemsProtected,
                rowVersion: "",
                formRegionChecksums: [],
            },
            salt: formCredentials.salt,
        };

        formData.append("p_json", JSON.stringify(jsonPayload));

        const ajaxResponse = await axios.post(
            `${ajaxUrl}${formCredentials.instance}`,
            formData,
            {
                headers: {
                    ...COMMON_HEADERS,
                    ...POST_HEADERS,
                    ...formData.getHeaders(),
                    Referer: baseUrl,
                    Cookie: cookies,
                },
                maxRedirects: 5,
            }
        );

        return ajaxResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error("Axios error:", error.message);
            if (error.response) {
                console.error("Response status:", error.response.status);
                console.error("Response data:", error.response.data);
            }
        } else {
            console.error("Error:", error);
        }
        throw error;
    }
}

export async function loadCredentials(): Promise<Credentials> {
    try {
        const data = await fs.readFile(FILE_DIR_PREFIX + CREDENTIALS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading credentials:', error);
        return {};
    }
}

export async function getInitialCookies(): Promise<string> {
    try {
        const response = await axios.get(searchPage, {
            headers: COMMON_HEADERS,
            maxRedirects: 5,
        });
        
        const cookies = response.headers['set-cookie'];
        if (!cookies || cookies.length === 0) {
            console.warn('No cookies received from server, checking for existing cookies in response headers');
            const existingCookies = response.headers['cookie'];
            if (existingCookies) {
                return existingCookies;
            }
            throw new Error('No cookies found in server response');
        }
        
        // Filter out any null or undefined values and join
        return cookies.filter(Boolean).join('; ');
    } catch (error) {
        console.error('Error getting initial cookies:', error);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        }
        throw error;
    }
}

/**
 * Interface for the AJAX response structure
 */
interface AjaxResponse {
    regions?: Array<{
        fetchedData?: {
            values?: Array<Array<string | { v: string; d: string } | { salt: string; protected: string; rowVersion: string }>>;
        };
    }>;
}

/**
 * Extracts URLs from HTML anchor tags
 * @param htmlString The HTML string containing anchor tags
 * @returns The extracted URL or null if no URL found
 */
function extractUrlFromHtml(htmlString: string): string | null {
    try {
        const $ = cheerio.load(htmlString);
        const href = $('a').attr('href');
        return href || null;
    } catch (error) {
        console.error('Error extracting URL from HTML:', error);
        return null;
    }
}

/**
 * Gets or creates a folder for the given search query
 * @param searchQuery The search query to create folder for
 * @returns The path to the query folder
 */
export async function getQueryFolder(searchQuery: string): Promise<string> {
    const queryFolder = `${FILE_DIR_PREFIX}${searchQuery}/`;
    await fs.mkdir(queryFolder, { recursive: true });
    return queryFolder;
}

/**
 * Extracts and saves URLs from AJAX response
 * @param ajaxResponse The AJAX response object
 * @param searchQuery The search query for folder organization
 * @returns Array of extracted URLs
 */
export async function extractAndSaveUrls(ajaxResponse: AjaxResponse, searchQuery: string): Promise<string[]> {
    try {
        const urls: string[] = [];
        
        // Extract URLs from the response
        ajaxResponse.regions?.forEach(region => {
            region.fetchedData?.values?.forEach(valueArray => {
                if (valueArray[1] && typeof valueArray[1] === 'string') {
                    const url = extractUrlFromHtml(valueArray[1]);
                    if (url) {
                        const absoluteUrl = url.startsWith('/') ? `${baseUrl}${url}` : url;
                        urls.push(absoluteUrl);
                    }
                }
            });
        });

        // if (urls.length > 0) {
        //     const queryFolder = await getQueryFolder(searchQuery);
        //     // Save URLs to a file
        //     const urlsWithNewlines = urls.join('\n');
        //     await fs.writeFile(`${queryFolder}extracted_urls.csv`, urlsWithNewlines, 'utf-8');
        //     console.log(`Saved ${urls.length} URLs to ${queryFolder}extracted_urls.csv`);
        // } else {
        //     console.log('No URLs found in the AJAX response');
        // }

        return urls;
    } catch (error) {
        console.error('Error extracting and saving URLs:', error);
        throw error;
    }
}

interface ExtractedInfo {
    url?: string;
    scrapedAt?: string;
    trackingNumber?: string;    // شماره پیگیری
    letterNumber?: string;      // شماره نامه
    letterDate?: string;        // تاریخ نامه
    newspaperNumber?: string;   // شماره روزنامه
    newspaperDate?: string;     // تاریخ روزنامه
    pageNumber?: string;        // شماره صفحه روزنامه
    publishCount?: string;      // تعداد نوبت انتشار
    title?: string;            // عنوان آگهی
    content?: string;          // متن آگهی
}

/**
 * Extracts specific information from the HTML content
 * @param html The HTML content to parse
 * @returns Object containing the extracted information
 */
function extractPageInfo(html: string, url: string): ExtractedInfo {
    const $ = cheerio.load(html);
    const info: ExtractedInfo = {};

    // Helper function to get text content and clean it
    const getText = (selector: string): string => {
        return $(selector).text().trim().replace(/\s+/g, ' ');
    };

    // Helper function to get input value
    const getValue = (selector: string): string => {
        return $(selector).val()?.toString().trim() || '';
    };

    try {
        info.url = url;
        info.scrapedAt = new Date().toISOString();
        info.title = getText('span#P28_TITLE_DISPLAY');
        info.trackingNumber = getText('span#P28_REFERENCENUMBER_DISPLAY');
        info.letterNumber = getText('span#P28_INDIKATORNUMBER_DISPLAY');
        info.letterDate = getText('span#P28_SABTDATE_DISPLAY');
        info.newspaperNumber = getText('span#P28_NEWSPAPERNO_DISPLAY');
        info.newspaperDate = getText('span#P28_NEWSPAPERDATE_DISPLAY');
        info.pageNumber = getText('span#P28_PAGENUMBER_DISPLAY');
        info.publishCount = getText('span#P28_HCNEWSSTAGE_DISPLAY');

        const regionId = $('[aria-label="متن آگهی:"]').attr('id');
        info.content = getText(`[region-id=${regionId}]`);

        // Clean up empty values
        Object.keys(info).forEach((key) => {
            if (!info[key as keyof ExtractedInfo]) {
                delete info[key as keyof ExtractedInfo];
            }
        });

    } catch (error) {
        console.error('Error extracting page info:', error);
    }

    return info;
}

/**
 * Fetches HTML content from a URL using existing credentials and saves it
 * Also extracts specific information from the page
 */
export async function fetchAndSaveHtml(url: string, searchQuery: string, filename?: string): Promise<{html: string, info: ExtractedInfo}> {
    try {
        // Get credentials
        const credentials = await loadCredentials();
        let cookies = credentials?.[searchPage]?.cookies;

        if (!cookies) {
            console.log("No existing cookies found, fetching new ones...");
            cookies = await getInitialCookies();
        }

        // Make the request with all necessary headers
        const response = await axios.get(url, {
            headers: {
                ...COMMON_HEADERS,
                ...CACHE_HEADERS,
                Cookie: cookies,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Upgrade-Insecure-Requests": "1",
            },
            maxRedirects: 5,
        });

        // Create folder for this search query if it doesn't exist
        const queryFolder = await getQueryFolder(searchQuery);

        // Generate filename based on URL if not provided
        const defaultFilename = url.split("/").pop()?.split("?")[0] || "page";
        const htmlFilename = `${filename || defaultFilename}.html`;

        // Extract information from the HTML
        const extractedInfo = extractPageInfo(response.data, url);

        return {
            html: response.data,
            info: extractedInfo
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error("Error fetching HTML:", error.message);
            if (error.response) {
                console.error("Response status:", error.response.status);
                console.error("Response headers:", error.response.headers);
            }
        } else {
            console.error("Error:", error);
        }
        throw error;
    }
}

/**
 * Writes a batch of ExtractedInfo objects to a CSV file
 * @param filePath Path to the CSV file
 * @param data Array of ExtractedInfo objects to write
 * @param isFirstBatch Whether this is the first batch (to write headers)
 */
async function writeExtractedInfoBatchToCsv(
    filePath: string,
    data: ExtractedInfo[],
    isFirstBatch: boolean
): Promise<void> {
    // Define the order of columns
    const columns = [
        'rowNumber',
        'url',
        'scrapedAt',
        'trackingNumber',
        'letterNumber',
        'letterDate',
        'newspaperNumber',
        'newspaperDate',
        'pageNumber',
        'publishCount',
        'title',
        'content'
    ];

    // Create CSV content for this batch
    let csvContent = '';

    // Add headers if this is the first batch
    if (isFirstBatch) {
        csvContent = columns.join(',') + '\n';
    }

    // Add data rows
    const startRow = isFirstBatch ? 1 : await getCurrentRowCount(filePath);
    data.forEach((item, index) => {
        const rowNumber = startRow + index;
        const row = columns.map(col => {
            if (col === 'rowNumber') return rowNumber;
            const value = item[col as keyof ExtractedInfo] || '';
            // Escape commas and quotes in the value
            return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvContent += row.join(',') + '\n';
    });

    // Append to file
    await fs.appendFile(filePath, csvContent, 'utf-8');
}

/**
 * Gets the current number of rows in the CSV file
 * @param filePath Path to the CSV file
 * @returns Number of rows (excluding header)
 */
async function getCurrentRowCount(filePath: string): Promise<number> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        // Count newlines (subtract 1 for header)
        return content.split('\n').length - 1;
    } catch {
        // File doesn't exist yet
        return 0;
    }
}

/**
 * Processes a list of URLs and extracts information from each page
 * @param urls List of URLs to process
 * @param searchQuery The search query for folder organization
 * @returns Number of successfully processed URLs
 */
export async function processExtractedUrls(urls: string[], searchQuery: string): Promise<number> {
    const BATCH_SIZE = 200;
    const results: ExtractedInfo[] = [];
    const errors: { url: string; error: string }[] = [];
    let currentBatch: ExtractedInfo[] = [];
    
    // Create folder and get path
    const queryFolder = await getQueryFolder(searchQuery);
    const csvFilePath = `${queryFolder}extracted_data.csv`;

    console.log(`Starting to process ${urls.length} URLs...`);

    for (const [index, url] of urls.entries()) {
        try {
            console.log(`Processing URL ${index + 1}/${urls.length}`);
            const { info } = await fetchAndSaveHtml(url, searchQuery, `page_${index + 1}`);
            results.push(info);
            currentBatch.push(info);

            // Process batch if it reaches BATCH_SIZE or this is the last item
            if (currentBatch.length >= BATCH_SIZE || index === urls.length - 1) {
                await writeExtractedInfoBatchToCsv(
                    csvFilePath,
                    currentBatch,
                    index < BATCH_SIZE // isFirstBatch if we're still in the first batch
                );
                // Clear the batch array to free memory
                currentBatch = [];
            }
        } catch (error) {
            console.error(`Error processing URL ${url}:`, error);
            errors.push({
                url,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    if (errors.length > 0) {
        console.warn(`Completed with ${errors.length} errors:`, errors);
        // Save errors to a separate file
        await writeJsonFile(`${queryFolder}errors.json`, errors);
    }

    console.log(`Successfully processed ${results.length} out of ${urls.length} URLs`);
    console.log(`Results saved to: ${csvFilePath}`);
    
    // Clear arrays to free memory
    currentBatch = [];
    const processedCount = results.length;
    results.length = 0;

    return processedCount;
}
