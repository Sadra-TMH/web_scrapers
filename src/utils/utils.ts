import fs from "fs/promises";
import * as cheerio from "cheerio";
import { writeJsonFile, saveCredentials } from "./fileUtils";
import { FILE_DIR_PREFIX } from "./fileUtils";
import axios from "axios";
import FormData from "form-data";
import * as fsSync from "fs";
import path from "path";

// Logger types and utility
export type LogLevel = "info" | "error" | "warn" | "debug";

interface LogContext {
    searchQuery?: string;
    component?: string;
    url?: string;
    workerId?: string;
}

interface LogOptions {
    context?: LogContext;
    error?: Error | unknown;
}

class Logger {
    private static logFile: string;
    private static writeStream: fsSync.WriteStream | null = null;

    static initialize(logDirectory: string = FILE_DIR_PREFIX) {
        // Ensure the log directory exists
        if (!fsSync.existsSync(logDirectory)) {
            fsSync.mkdirSync(logDirectory, { recursive: true });
        }

        this.logFile = path.join(logDirectory, 'output.log');
        
        // Create or open the write stream
        this.writeStream = fsSync.createWriteStream(this.logFile, { flags: 'a' });
        
        // Handle process termination
        process.on('exit', () => this.cleanup());
        process.on('SIGINT', () => {
            this.cleanup();
            process.exit();
        });
    }

    private static cleanup() {
        if (this.writeStream) {
            this.writeStream.end();
            this.writeStream = null;
        }
    }

    private static writeToFile(message: string) {
        if (!this.writeStream) {
            this.initialize();
        }
        this.writeStream?.write(message + '\n');
    }

    private static formatMessage(
        level: LogLevel,
        message: string,
        options?: LogOptions
    ): string {
        const timestamp = new Date().toISOString();
        const context = options?.context;
        let formattedMessage = `[${timestamp}] [${level.toUpperCase()}]`;

        if (context?.workerId) {
            formattedMessage += ` [${context.workerId}]`;
        }
        if (context?.component) {
            formattedMessage += ` [${context.component}]`;
        }
        if (context?.searchQuery) {
            formattedMessage += ` [Query: ${context.searchQuery}]`;
        }
        if (context?.url) {
            formattedMessage += ` [URL: ${context.url}]`;
        }

        formattedMessage += `: ${message}`;

        if (options?.error) {
            const error = options.error as Error;
            if (error.message) {
                formattedMessage += `\nError: ${error.message}`;
            }
            if (error.stack) {
                formattedMessage += `\nStack: ${error.stack}`;
            }
        }

        return formattedMessage;
    }

    static log(level: LogLevel, message: string, options?: LogOptions): void {
        const formattedMessage = this.formatMessage(level, message, options);
        this.writeToFile(formattedMessage);
    }

    static info(message: string, options?: LogOptions): void {
        this.log("info", message, options);
    }

    static error(message: string, options?: LogOptions): void {
        this.log("error", message, options);
    }

    static warn(message: string, options?: LogOptions): void {
        this.log("warn", message, options);
    }

    static debug(message: string, options?: LogOptions): void {
        this.log("debug", message, options);
    }
}

// Initialize logger
Logger.initialize();

export { Logger };

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
    companyRegionData: {
        regionId?: string;
        worksheetId?: string;
        reportId?: string;
        ajaxIdentifier?: string;
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
        companyRegionData: {
            regionId: "",
            worksheetId: "",
            reportId: "",
            ajaxIdentifier: "",
        },
    };
    const $ = cheerio.load(html);

    // Helper function to get input value
    const getValue = (selector: string): string | undefined => {
        return $(selector).val()?.toString();
    };

    // Helper function to get attribute value
    const getAttr = (selector: string, attr: string): string | undefined => {
        return $(selector).attr(attr);
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
        // Try multiple patterns to extract region ID
        const regionId = $("#P155_COMPANY_CODE")
            .next("div")
            .attr("id")
            ?.replace("_ir", "");

        if (regionId) {
            credentials.companyRegionData.regionId = regionId;

            // Extract worksheet ID
            const worksheetIdSelector = `#${regionId}_worksheet_id`;
            const worksheetId = getValue(worksheetIdSelector);
            credentials.companyRegionData.worksheetId = worksheetId;

            // Extract report ID
            const reportId = getValue(`#${regionId}_report_id`);
            credentials.companyRegionData.reportId = reportId;

            // Extract ajax identifier from the script containing the region ID
            const scriptWithRegionId = $(
                `script:contains("${regionId}")`
            ).text();
            if (scriptWithRegionId) {
                const configMatch = scriptWithRegionId.match(
                    /interactiveReport\((.*?)\);/s
                );

                if (configMatch) {
                    const configStr = configMatch[1];
                    const config = JSON.parse(configStr);
                    credentials.companyRegionData.ajaxIdentifier =
                        config.ajaxIdentifier;
                }
            }
        }

        // Extract grid configuration from script tag
        const gridScript = $('script:contains("interactiveGrid")').text();
        if (gridScript) {
            const configMatch = gridScript.match(/interactiveGrid\((.*?)\);/s);
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
                        const ajaxIdentifierRegex =
                            /"affectedElements"\s*:\s*"([^"]+)"[^}]*"ajaxIdentifier"\s*:\s*"([^"]+)"/g;

                        let match;
                        while (
                            (match = ajaxIdentifierRegex.exec(eventListStr)) !==
                            null
                        ) {
                            const element = match[1];
                            const identifier = match[2];

                            if (element && identifier) {
                                credentials.ajaxIdentifiers[element] =
                                    identifier;
                            }
                        }

                        // Also look for triggering elements
                        const triggerRegex =
                            /"triggeringElement"\s*:\s*"([^"]+)"[^}]*"ajaxIdentifier"\s*:\s*"([^"]+)"/g;

                        while (
                            (match = triggerRegex.exec(eventListStr)) !== null
                        ) {
                            const element = match[1];
                            const identifier = match[2];

                            if (element && identifier) {
                                credentials.ajaxIdentifiers[element] =
                                    parseEncodedString(identifier);
                            }
                        }
                    } catch (error) {
                        Logger.error("Error extracting AJAX identifiers:", {
                            context: {
                                component: "Credentials",
                            },
                            error,
                        });
                    }
                }
            } catch (error) {
                Logger.error("Error processing event list:", {
                    context: {
                        component: "Credentials",
                    },
                    error,
                });
            }
        }
    } catch (error) {
        Logger.error("Error during extraction:", {
            context: {
                component: "Credentials",
            },
            error,
        });
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
    const preparedString = encodedString.replace(/\\u002F/g, "/");

    // Use JSON.parse to properly handle the escaped characters
    // We need to wrap it in quotes to make it a valid JSON string
    try {
        return JSON.parse(`"${preparedString}"`);
    } catch (error) {
        console.error("Error parsing encoded string:", error);
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
    getAdditionalItems = () => [],
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
        const additionalItems = getAdditionalItems(
            formCredentials.flowStepId || ""
        );
        // Create FormData instance
        const formData = new FormData();
        formData.append("p_flow_id", formCredentials.flowId || "");
        formData.append("p_flow_step_id", formCredentials.flowStepId || "");
        formData.append("p_instance", formCredentials.instance || "");
        formData.append("p_debug", "");

        const ajaxIdentifier = formCredentials.ajaxIdentifiers?.[elementId];
        if (!ajaxIdentifier) {
            throw new Error(
                `No AJAX identifier found for element: ${elementId}`
            );
        }

        formData.append("p_request", `PLUGIN=${ajaxIdentifier}`);

        // Prepare the JSON payload
        const itemsToSubmit = [...additionalItems].map((item) => ({
            n: item.name,
            v: item.value,
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
                timeout: TIMEOUT,
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
        const data = await fs.readFile(
            FILE_DIR_PREFIX + CREDENTIALS_FILE,
            "utf-8"
        );
        return JSON.parse(data);
    } catch (error) {
        console.error("Error loading credentials:", error);
        return {};
    }
}

export async function getInitialCookies(): Promise<string> {
    try {
        const response = await axios.get(searchPage, {
            headers: COMMON_HEADERS,
            maxRedirects: 5,
        });

        const cookies = response.headers["set-cookie"];
        if (!cookies || cookies.length === 0) {
            console.warn(
                "No cookies received from server, checking for existing cookies in response headers"
            );
            const existingCookies = response.headers["cookie"];
            if (existingCookies) {
                return existingCookies;
            }
            throw new Error("No cookies found in server response");
        }

        // Filter out any null or undefined values and join
        return cookies.filter(Boolean).join("; ");
    } catch (error) {
        console.error("Error getting initial cookies:", error);
        if (axios.isAxiosError(error) && error.response) {
            console.error("Response status:", error.response.status);
            console.error("Response headers:", error.response.headers);
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
            values?: Array<
                Array<
                    | string
                    | { v: string; d: string }
                    | { salt: string; protected: string; rowVersion: string }
                >
            >;
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
        const href = $("a").attr("href");
        return href || null;
    } catch (error) {
        console.error("Error extracting URL from HTML:", error);
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
export async function extractAndSaveUrls(
    ajaxResponse: AjaxResponse,
    searchQuery: string
): Promise<string[]> {
    try {
        const urls: string[] = [];

        // Extract URLs from the response
        ajaxResponse.regions?.forEach((region) => {
            region.fetchedData?.values?.forEach((valueArray) => {
                if (valueArray[1] && typeof valueArray[1] === "string") {
                    const url = extractUrlFromHtml(valueArray[1]);
                    if (url) {
                        const absoluteUrl = url.startsWith("/")
                            ? `${baseUrl}${url}`
                            : url;
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
        console.error("Error extracting and saving URLs:", error);
        throw error;
    }
}

interface ExtractedInfo {
    url?: string;
    scrapedAt?: string;
    trackingNumber?: string; // شماره پیگیری
    letterNumber?: string; // شماره نامه
    letterDate?: string; // تاریخ نامه
    newspaperNumber?: string; // شماره روزنامه
    newspaperDate?: string; // تاریخ روزنامه
    pageNumber?: string; // شماره صفحه روزنامه
    publishCount?: string; // تعداد نوبت انتشار
    title?: string; // عنوان آگهی
    content?: string; // متن آگهی
    companyName?: string;
    companyNationalId?: string;
    companyRegisterNumber?: string;
    letterPublisher?: string;
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
        return $(selector).text().trim().replace(/\s+/g, " ");
    };

    // Helper function to get input value
    const getValue = (selector: string): string => {
        return $(selector).val()?.toString().trim() || "";
    };

    try {
        info.url = url;
        info.scrapedAt = new Date().toISOString();
        info.title = getText("span#P28_TITLE_DISPLAY");
        info.trackingNumber = getText("span#P28_REFERENCENUMBER_DISPLAY");
        info.letterNumber = getText("span#P28_INDIKATORNUMBER_DISPLAY");
        info.letterDate = getText("span#P28_SABTDATE_DISPLAY");
        info.newspaperNumber = getText("span#P28_NEWSPAPERNO_DISPLAY");
        info.newspaperDate = getText("span#P28_NEWSPAPERDATE_DISPLAY");
        info.pageNumber = getText("span#P28_PAGENUMBER_DISPLAY");
        info.publishCount = getText("span#P28_HCNEWSSTAGE_DISPLAY");

        info.companyName = getText("span#P28_COMPANYNAME_DISPLAY");
        info.companyNationalId = getText("span#P28_SABTNATIONALID_DISPLAY");
        info.companyRegisterNumber = getText("span#P28_SABTNUMBER_DISPLAY");
        info.letterPublisher = getText("span#P28_AGAHI_SADER_KONANDE_DISPLAY");

        const regionId = $('[aria-label="متن آگهی:"]').attr("id");
        info.content = getText(`[region-id=${regionId}]`);

        // Clean up empty values
        Object.keys(info).forEach((key) => {
            if (!info[key as keyof ExtractedInfo]) {
                delete info[key as keyof ExtractedInfo];
            }
        });
    } catch (error) {
        console.error("Error extracting page info:", error);
    }

    return info;
}

// Add these constants at the top of the file after imports
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
const TIMEOUT = 90000; // 90 seconds

// Add this utility function for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches HTML content from a URL using existing credentials and saves it
 * Also extracts specific information from the page
 */
export async function fetchAndSaveHtml(
    url: string,
    searchQuery: string,
    filename?: string,
    workerId?: string
): Promise<{ html: string; info: ExtractedInfo }> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Get credentials
            const credentials = await loadCredentials();
            let cookies = credentials?.[searchPage]?.cookies;

            // Shorten URL for logging
            const urlObj = new URL(url);
            const shortUrl = urlObj.pathname + urlObj.search;

            if (!cookies) {
                Logger.info("No existing cookies found, fetching new ones...", {
                    context: {
                        searchQuery,
                        component: "Auth",
                        url: shortUrl,
                        workerId,
                    },
                });
                cookies = await getInitialCookies();
            }

            // Make the request with all necessary headers and timeout
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
                timeout: TIMEOUT,
                validateStatus: (status) => status < 500, // Only treat 500+ errors as errors
            });

            // Extract information from the HTML
            const extractedInfo = extractPageInfo(response.data, url);

            return {
                html: response.data,
                info: extractedInfo,
            };
        } catch (error) {
            lastError = error as Error;
            
            // Shorten URL for logging
            const urlObj = new URL(url);
            const shortUrl = urlObj.pathname + urlObj.search;
            
            // Log the retry attempt
            Logger.warn(`Attempt ${attempt}/${MAX_RETRIES} failed for URL`, {
                context: {
                    searchQuery,
                    component: "URLProcessor",
                    url: shortUrl,
                    workerId,
                },
                error,
            });

            // If this was the last attempt, throw the error
            if (attempt === MAX_RETRIES) {
                throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
            }

            // If it's a network error or 5xx error, wait before retrying
            if (axios.isAxiosError(error) && 
                (error.code === 'ECONNABORTED' || 
                 error.code === 'ETIMEDOUT' || 
                 error.code === 'ECONNRESET' ||
                 (error.response?.status && error.response.status >= 500))) {
                await delay(RETRY_DELAY * attempt); // Exponential backoff
                continue;
            }

            // If it's not a retryable error, throw immediately
            throw error;
        }
    }

    // This should never be reached due to the throw in the loop
    throw lastError || new Error('Unknown error occurred');
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
    isFirstBatch: boolean,
    searchQuery: string,
    workerId?: string
): Promise<void> {
    // Define the order of columns
    const columns = [
        "rowNumber",
        "url",
        "scrapedAt",
        "trackingNumber",
        "letterNumber",
        "letterDate",
        "newspaperNumber",
        "newspaperDate",
        "pageNumber",
        "publishCount",
        "title",
        "content",
        "companyName",
        "companyNationalId",
        "companyRegisterNumber",
        "letterPublisher",
    ];

    let csvContent = "";
    let shouldAddHeaders = false;

    try {
        // Check if file exists and is empty
        try {
            const stats = await fs.stat(filePath);
            shouldAddHeaders = stats.size === 0;
        } catch (error) {
            // File doesn't exist, we should add headers
            shouldAddHeaders = true;
        }

        // Add headers only if this is the first batch AND file is empty/doesn't exist
        if (isFirstBatch && shouldAddHeaders) {
            Logger.debug(`Adding headers to CSV file`, {
                context: {
                    searchQuery,
                    component: "CSV",
                    url: filePath,
                    workerId,
                },
            });
            csvContent = columns.join(",") + "\n";
        }

        // Add data rows
        const startRow = shouldAddHeaders
            ? 1
            : await getCurrentRowCount(filePath);
        data.forEach((item, index) => {
            const rowNumber = startRow + index;
            const row = columns.map((col) => {
                if (col === "rowNumber") return rowNumber;
                const value = item[col as keyof ExtractedInfo] || "";
                // Escape commas and quotes in the value
                return `"${String(value).replace(/"/g, '""')}"`;
            });
            csvContent += row.join(",") + "\n";
        });

        // Append to file
        await fs.appendFile(filePath, csvContent, "utf-8");
        Logger.info(`Wrote batch of ${data.length} records to CSV`, {
            context: {
                searchQuery,
                component: "CSV",
                url: filePath,
                workerId,
            },
        });
    } catch (error) {
        Logger.error(`Failed to write batch to CSV`, {
            context: {
                searchQuery,
                component: "CSV",
                url: filePath,
                workerId,
            },
            error,
        });
        throw error;
    }
}

/**
 * Gets the current number of rows in the CSV file
 * @param filePath Path to the CSV file
 * @returns Number of rows (excluding header)
 */
async function getCurrentRowCount(filePath: string): Promise<number> {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        // Count newlines (subtract 1 for header)
        return content.split("\n").length - 1;
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
export async function processExtractedUrls(
    urls: string[],
    searchQuery: string,
    workerId?: string
): Promise<number> {
    const BATCH_SIZE = 50; // Reduced batch size
    const results: ExtractedInfo[] = [];
    const errors: { url: string; error: string; attempts: number }[] = [];
    let currentBatch: ExtractedInfo[] = [];
    let successCount = 0;

    const queryFolder = await getQueryFolder(searchQuery);
    const csvFilePath = `${queryFolder}extracted_data.csv`;
    const errorFilePath = `${queryFolder}errors.json`;

    Logger.info(`Starting URL processing`, {
        context: {
            searchQuery,
            component: "URLProcessor",
            workerId,
        },
    });

    for (const [index, url] of urls.entries()) {
        try {
            // Shorten URL for logging by extracting pathname
            const urlObj = new URL(url);
            const shortUrl = urlObj.pathname + urlObj.search;

            Logger.debug(`Processing URL ${index + 1}/${urls.length}`, {
                context: {
                    searchQuery,
                    component: "URLProcessor",
                    url: shortUrl,
                    workerId,
                },
            });

            const { info } = await fetchAndSaveHtml(
                url,
                searchQuery,
                `page_${index + 1}`,
                workerId
            );
            
            results.push(info);
            currentBatch.push(info);
            successCount++;

            // Write batch to CSV if batch size reached or last item
            if (currentBatch.length >= BATCH_SIZE || index === urls.length - 1) {
                await writeExtractedInfoBatchToCsv(
                    csvFilePath,
                    currentBatch,
                    index < BATCH_SIZE,
                    searchQuery,
                    workerId
                );
                currentBatch = [];
                
                // Add a small delay between batches to prevent overwhelming the server
                await delay(1000);
            }
        } catch (error) {
            // Shorten URL for logging
            const urlObj = new URL(url);
            const shortUrl = urlObj.pathname + urlObj.search;

            Logger.error(`Failed to process URL`, {
                context: {
                    searchQuery,
                    component: "URLProcessor",
                    url: shortUrl,
                    workerId,
                },
                error,
            });
            
            errors.push({
                url: shortUrl,
                error: error instanceof Error ? error.message : "Unknown error",
                attempts: MAX_RETRIES,
            });

            // Write errors to file immediately
            await writeJsonFile(errorFilePath, errors);
        }
    }

    if (errors.length > 0) {
        Logger.warn(`Completed with ${errors.length} errors`, {
            context: {
                searchQuery,
                component: "URLProcessor",
                workerId,
            },
        });
    }

    Logger.info(`Processing completed. Success: ${successCount}, Failures: ${errors.length}`, {
        context: {
            searchQuery,
            component: "URLProcessor",
            workerId,
        },
    });

    return successCount;
}

export function generateCombinationsIterative(maxLength: number): string[] {
    const persianLetters = [
        "آ", "ا", "ب", "پ", "ت", "ث", "ج", "چ", "ح", "خ", "د", "ذ", "ر", "ز", "ژ",
        "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ک", "گ", "ل", "م", "ن",
        "و", "ه", "ی"
    ];

    if (maxLength <= 0) {
        return [];
    }

    let combinations: string[] = [...persianLetters]; // Start with single letters
    
    // For each additional length up to maxLength
    for (let currentLength = 2; currentLength <= maxLength; currentLength++) {
        const newCombinations: string[] = [];
        
        // For each existing combination
        for (const combination of combinations) {
            // Add each Persian letter to create new combinations
            for (const letter of persianLetters) {
                newCombinations.push(combination + letter);
            }
        }
        
        // Replace old combinations with new ones
        combinations = newCombinations;
    }
    
    return combinations; // Now only contains combinations of exactly maxLength
}

// Add these types for status tracking
interface CombinationStatus {
    combination: string;
    status: 'pending' | 'completed' | 'failed';
    startedAt?: string;
    completedAt?: string;
    error?: string;
    workerId?: string;
}

interface BatchStatus {
    length: number;
    totalCombinations: number;
    processedCount: number;
    failedCount: number;
    lastProcessed?: string;
    startedAt: string;
    lastUpdated: string;
    combinations: { [key: string]: CombinationStatus };
}

async function getOrCreateStatusFile(combination: string): Promise<CombinationStatus | null> {
    try {
        const queryFolder = await getQueryFolder(combination);
        const statusPath = `${queryFolder}status.json`;
        
        try {
            const statusContent = await fs.readFile(statusPath, 'utf-8');
            return JSON.parse(statusContent);
        } catch (error) {
            // If file doesn't exist or can't be parsed, return null
            return null;
        }
    } catch (error) {
        Logger.error(`Failed to read status file`, {
            context: {
                component: "StatusManager",
                searchQuery: combination,
            },
            error,
        });
        return null;
    }
}

async function updateStatusFile(combination: string, status: CombinationStatus): Promise<void> {
    try {
        const queryFolder = await getQueryFolder(combination);
        const statusPath = `${queryFolder}status.json`;
        await writeJsonFile(statusPath, status);
    } catch (error) {
        Logger.error(`Failed to update status file`, {
            context: {
                component: "StatusManager",
                searchQuery: combination,
            },
            error,
        });
    }
}

async function getOrCreateBatchStatus(length: number): Promise<BatchStatus> {
    const batchStatusPath = `${FILE_DIR_PREFIX}batch_status_${length}.json`;
    
    try {
        const content = await fs.readFile(batchStatusPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        // If file doesn't exist or can't be parsed, create new batch status
        const newStatus: BatchStatus = {
            length,
            totalCombinations: 0, // Will be set later
            processedCount: 0,
            failedCount: 0,
            startedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            combinations: {},
        };
        await writeJsonFile(batchStatusPath, newStatus);
        return newStatus;
    }
}

async function updateBatchStatus(length: number, status: BatchStatus): Promise<void> {
    const batchStatusPath = `${FILE_DIR_PREFIX}batch_status_${length}.json`;
    status.lastUpdated = new Date().toISOString();
    await writeJsonFile(batchStatusPath, status);
}

export async function processCombinationsWithSearch(
    searchFunction: (combination: string) => Promise<any>,
    length: number,
    workers: number = 1,
    workerId: number = 0,
    batchSize: number = 100
): Promise<void> {
    Logger.info(`Starting combination processing for length ${length} on worker ${workerId}`, {
        context: {
            component: "CombinationProcessor",
            workerId: `Worker-${workerId}`,
        },
    });

    const allCombinations = generateCombinationsIterative(length);
    const totalCombinations = allCombinations.length;
    
    // Calculate the range for this worker
    const combinationsPerWorker = Math.ceil(totalCombinations / workers);
    const startIndex = workerId * combinationsPerWorker;
    const endIndex = Math.min((workerId + 1) * combinationsPerWorker, totalCombinations);
    const combinations = allCombinations.slice(startIndex, endIndex);

    // Get or create batch status
    const batchStatus = await getOrCreateBatchStatus(length);
    if (!batchStatus.totalCombinations) {
        batchStatus.totalCombinations = totalCombinations;
    }

    Logger.info(`Worker ${workerId} processing ${combinations.length} combinations (${startIndex + 1} to ${endIndex})`, {
        context: {
            component: "CombinationProcessor",
            workerId: `Worker-${workerId}`,
        },
    });

    // Process in batches to manage memory and avoid overwhelming the system
    for (let i = 0; i < combinations.length; i += batchSize) {
        const batch = combinations.slice(i, i + batchSize);
        Logger.info(`Worker ${workerId} processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(combinations.length/batchSize)}`, {
            context: {
                component: "CombinationProcessor",
                workerId: `Worker-${workerId}`,
            },
        });

        // Process each combination in the current batch
        for (const combination of batch) {
            // Check if combination was already processed
            const existingStatus = await getOrCreateStatusFile(combination);
            if (existingStatus?.status === 'completed') {
                Logger.info(`Worker ${workerId} skipping already processed combination: ${combination}`, {
                    context: {
                        component: "CombinationProcessor",
                        workerId: `Worker-${workerId}`,
                    },
                });
                continue;
            }

            // Create new status for this combination
            const combinationStatus: CombinationStatus = {
                combination,
                status: 'pending',
                startedAt: new Date().toISOString(),
                workerId: `Worker-${workerId}`,
            };

            // Update status files
            await updateStatusFile(combination, combinationStatus);
            batchStatus.combinations[combination] = combinationStatus;
            await updateBatchStatus(length, batchStatus);

            try {
                Logger.debug(`Processing combination: ${combination}`, {
                    context: {
                        component: "CombinationProcessor",
                        workerId: `Worker-${workerId}`,
                    },
                });

                await searchFunction(combination);

                // Update status to completed
                combinationStatus.status = 'completed';
                combinationStatus.completedAt = new Date().toISOString();
                batchStatus.processedCount++;
                batchStatus.lastProcessed = combination;

            } catch (error) {
                Logger.error(`Error processing combination: ${combination}`, {
                    context: {
                        component: "CombinationProcessor",
                        workerId: `Worker-${workerId}`,
                    },
                    error,
                });

                // Update status to failed
                combinationStatus.status = 'failed';
                combinationStatus.completedAt = new Date().toISOString();
                combinationStatus.error = error instanceof Error ? error.message : 'Unknown error';
                batchStatus.failedCount++;
            }

            // Update both status files
            await updateStatusFile(combination, combinationStatus);
            batchStatus.combinations[combination] = combinationStatus;
            await updateBatchStatus(length, batchStatus);
        }
    }

    Logger.info(`Worker ${workerId} completed processing assigned combinations`, {
        context: {
            component: "CombinationProcessor",
            workerId: `Worker-${workerId}`,
        },
    });
}

// Add these session management utilities after the existing constants
interface SessionResponse {
    error?: string;
    unsafe?: boolean;
    addInfo?: string;
    pageSubmissionId?: string;
}

async function isSessionExpired(response: any): Promise<boolean> {
    if (typeof response === 'object' && response !== null) {
        // Check for session expired message in the response
        if (response.error === "Your session has ended.") {
            return true;
        }
    }
    return false;
}

async function renewSession(): Promise<void> {
    try {
        Logger.info("Renewing session...", {
            context: {
                component: "SessionManager",
            },
        });

        // Clear existing credentials
        await writeJsonFile(FILE_DIR_PREFIX + CREDENTIALS_FILE, {});
        
        // Get new cookies and credentials
        const cookies = await getInitialCookies();
        
        Logger.info("Session renewed successfully", {
            context: {
                component: "SessionManager",
            },
        });
    } catch (error) {
        Logger.error("Failed to renew session", {
            context: {
                component: "SessionManager",
            },
            error,
        });
        throw error;
    }
}

async function withSessionRetry<T>(
    operation: () => Promise<T>,
    context: { searchQuery?: string; component?: string } = {}
): Promise<T> {
    try {
        const result = await operation();
        
        // Check if the result indicates session expiration
        if (await isSessionExpired(result)) {
            Logger.warn("Session expired, attempting renewal", {
                context: {
                    ...context,
                    component: "SessionManager",
                },
            });
            
            // Renew session
            await renewSession();
            
            // Retry the operation
            Logger.info("Retrying operation after session renewal", {
                context: {
                    ...context,
                    component: "SessionManager",
                },
            });
            return await operation();
        }
        
        return result;
    } catch (error) {
        // If the error response indicates session expiration, retry
        if (axios.isAxiosError(error) && 
            error.response?.data && 
            await isSessionExpired(error.response.data)) {
            
            Logger.warn("Session expired (from error), attempting renewal", {
                context: {
                    ...context,
                    component: "SessionManager",
                },
            });
            
            await renewSession();
            return await operation();
        }
        throw error;
    }
}



