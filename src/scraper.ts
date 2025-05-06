import axios from "axios";
import FormData from "form-data";
import {
    writeJsonFile,
    saveCredentials,
    loadCredentials,
    FILE_DIR_PREFIX,
    CREDENTIALS_FILE,
} from "./utils/fileUtils.js";
import {
    COMMON_HEADERS,
    POST_HEADERS,
    CACHE_HEADERS,
    searchPage,
    baseUrl,
    searchUrl,
    ajaxUrl,
    homeUrl,
    processExtractedUrls,
    getQueryFolder,
    Logger,
    getPaginationStatus,
    processCompanyData,
    generateCombinationsIterative,
} from "./utils/utils.js";
import { extractFormCredentials } from "./utils/utils.js";
import { handleAjaxFlow } from "./utils/utils.js";
import { extractAndSaveUrls } from "./utils/utils.js";
import * as readline from 'readline';
import { stdin as input, stdout as output } from 'node:process';
import { TIMEOUT } from "./utils/utils.js";

async function makeRequestAndSaveCredentials(
    url: string,
    credentialsKey: string | null = null,
    options: {
        method?: "GET" | "POST";
        headers?: Record<string, string>;
        data?: any;
        params?: Record<string, string>;
    } = {}
) {
    try {
        // Strip URL parameters for credential storage
        const baseUrl = url.split("?")[0];

        const credentials = await loadCredentials();
        // Use stripped URL for looking up credentials if no specific key is provided
        const lookupKey = credentialsKey ? credentialsKey.split("?")[0] : null;
        const existingCookies = lookupKey
            ? credentials?.[lookupKey]?.cookies
            : null;

        const response = await axios({
            method: options.method || "GET",
            url,
            headers: {
                ...COMMON_HEADERS,
                ...(existingCookies ? { Cookie: existingCookies } : {}),
                ...options.headers,
            },
            data: options.data,
            params: options.params,
        });

        const cookies = response.headers["set-cookie"];
        const cookieString = cookies
            ? cookies.join("; ")
            : existingCookies || "";
        const formCredentials = await extractFormCredentials(response.data);
        // Only save credentials if we have either cookies or form data
        if (cookieString || Object.keys(formCredentials).length > 0) {
            await saveCredentials(baseUrl, {
                cookies: cookieString,
                formData: formCredentials,
            });
        }

        return {
            response,
            cookies: cookieString,
            formCredentials,
        };
    } catch (error) {
        Logger.error(`Request failed`, {
            context: {
                component: "Request",
                url,
            },
            error,
        });
        throw error;
    }
}

async function getInitialCookies(): Promise<string> {
    try {
        const initialUrl = homeUrl;
        Logger.debug(`Getting initial cookies`, {
            context: {
                component: "Auth",
                url: initialUrl,
            },
        });

        // Make initial request without any credentials
        const initialResult = await makeRequestAndSaveCredentials(initialUrl);

        // Make search page request using credentials from initial request
        if (initialResult.formCredentials.instance) {
            await makeRequestAndSaveCredentials(
                `${searchPage}?session=${initialResult.formCredentials.instance}`,
                initialUrl,
                {
                    headers: {
                        ...CACHE_HEADERS,
                    },
                }
            );
        }

        return initialResult.cookies;
    } catch (error) {
        Logger.error(`Failed to get initial cookies`, {
            context: {
                component: "Auth",
            },
            error,
        });
        throw error;
    }
}

async function flowAccept(searchQuery: string) {
    try {
        // Get credentials - either load existing or fetch new ones
        const credentials = await loadCredentials();
        let cookies = credentials?.[searchPage]?.cookies;

        if (!cookies) {
            Logger.info(`No existing cookies found, fetching new ones`, {
                context: {
                    searchQuery,
                    component: "Auth",
                },
            });
            cookies = await getInitialCookies();
        }

        const formCredentials = credentials?.[searchPage]?.formData;
        if (!formCredentials) {
            throw new Error("No form credentials found");
        }

        // Create FormData instance
        const formData = new FormData();
        // Ensure all values are strings when appending to FormData
        formData.append("p_flow_id", formCredentials.flowId || "");
        formData.append("p_flow_step_id", formCredentials.flowStepId || "");
        formData.append("p_instance", formCredentials.instance || "");
        formData.append("p_debug", "");
        formData.append("p_request", "SEARCH");
        formData.append("p_reload_on_submit", "S");
        formData.append(
            "p_page_submission_id",
            formCredentials.pageSubmissionId || ""
        );

        const flowStepId = formCredentials.flowStepId || "";
        // Prepare the JSON payload
        const jsonPayload = {
            pageItems: {
                itemsToSubmit: [
                    { n: `P${flowStepId}_SINGLE_SEARCH`, v: searchQuery },
                    { n: `P${flowStepId}_SINGLE_SEARCH_1`, v: "" },
                    {
                        n: "P0_CURRENT_PAGE_ID",
                        v: formCredentials.currentPageId?.value || "",
                        ck: formCredentials.currentPageId?.ck || "",
                    },
                    { n: `P${flowStepId}_FOOTER`, v: "" },
                    { n: `P${flowStepId}_FOOTER_1`, v: "" },
                    { n: `P${flowStepId}_FOOTER_2`, v: "" },
                    { n: `P${flowStepId}_MATN_1`, v: "" },
                    { n: `P${flowStepId}_COMPANY_NAME`, v: "" },
                    { n: `P${flowStepId}_NATIONALCODECOMPANY`, v: "" },
                    { n: `P${flowStepId}_SABTNOCOMPANY`, v: "" },
                    { n: `P${flowStepId}_NOE_AGAHI`, v: "" },
                    { n: `P${flowStepId}_INDIKATORNUMBER`, v: "" },
                    { n: `P${flowStepId}_NEWSPAPERTYPE`, v: "" },
                    { n: `P${flowStepId}_NEWSPAPERNO`, v: "" },
                    { n: `P${flowStepId}_PAGENUMBER`, v: "" },
                    { n: `P${flowStepId}_CODEPEYGIRI`, v: "" },
                    { n: `P${flowStepId}_EZHARNAMEHNO`, v: "" },
                    { n: `P${flowStepId}_CITYCODE`, v: "" },
                    { n: `P${flowStepId}_SABTNODATE_AZ`, v: "" },
                    { n: `P${flowStepId}_SABTNODATE_TA`, v: "" },
                    { n: `P${flowStepId}_NEWSSTATUS`, v: "" },
                    { n: `P${flowStepId}_NEWSPAPERDATE_AZ`, v: "" },
                    { n: `P${flowStepId}_NEWSPAPER_TA`, v: "" },
                    {
                        n: "P0_ORDER_ID",
                        v: formCredentials.orderId?.value || "",
                        ck: formCredentials.orderId?.ck || "",
                    },
                    {
                        n: "P0_ORDER_PRICE",
                        v: formCredentials.orderPrice || "",
                    },
                    { n: "P0_BANNER", v: formCredentials.banner || "" },
                    {
                        n: "P0_LINK_BANNER",
                        v: formCredentials.linkBanner || "",
                    },
                    {
                        n: "P0_TOOLTIP_BANNER",
                        v: formCredentials.tooltipBanner?.value || "",
                        ck: formCredentials.tooltipBanner?.ck || "",
                    },
                    {
                        n: "P0_CURRENTDATE",
                        v: formCredentials.currentDate || "",
                    },
                    { n: "P0_MT", v: formCredentials.mt || "" },
                    { n: `P${flowStepId}_CNT_RETURN_ROW`, v: "" },
                    { n: `P${flowStepId}_AMOUT_PER_ROW`, v: "50000" },
                    { n: `P${flowStepId}_TAX`, v: "10" },
                    { n: `P${flowStepId}_FINAL_COST`, v: "" },
                    { n: `P${flowStepId}_TOKEN`, v: "" },
                    { n: `P${flowStepId}_RESCODE`, v: "0" },
                    { n: `P${flowStepId}_ACTDIACT`, v: "0" },
                    { n: `P${flowStepId}_FREE_NON_FREE`, v: "0" },
                    { n: `P${flowStepId}_ERROR_MESSAGE`, v: "" },
                    { n: `P${flowStepId}_CODE`, v: "" },
                    { n: `P${flowStepId}_TYPEPAY`, v: "1" },
                    { n: `P${flowStepId}_TYPE`, v: "" },
                ],
                protected: formCredentials.pPageItemsProtected || "",
                rowVersion: "",
                formRegionChecksums: [],
            },
            salt: formCredentials.salt || "",
        };

        // Convert JSON to string before appending
        const jsonString = JSON.stringify(jsonPayload);
        formData.append("p_json", jsonString);

        const searchResponse = await axios.post(
            `${searchUrl}${formCredentials.instance}`,
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
        Logger.info(`Flow accept completed`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });

        return searchResponse.data;
    } catch (error) {
        Logger.error(`Flow accept failed`, {
            context: {
                searchQuery,
                component: "Search",
            },
            error,
        });
        throw error;
    }
}

async function flowAjax2(searchQuery: string) {
    try {
        const response = await handleAjaxFlow({
            searchQuery,
            getElement: (flowStepId) => `P${flowStepId}_SINGLE_SEARCH`,
            getAdditionalItems: (flowStepId) => [
                {
                    name: `P${flowStepId}_SINGLE_SEARCH`,
                    value: searchQuery,
                },
                {
                    name: `P${flowStepId}_SINGLE_SEARCH_1`,
                    value: "",
                },
            ],
        });

        Logger.info(`Flow ajax2 completed`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });

        return response;
    } catch (error) {
        Logger.error(`Flow ajax2 failed`, {
            context: {
                searchQuery,
                component: "Search",
            },
            error,
        });
        throw error;
    }
}

async function flowAjaxCompany(searchQuery: string, perPage: number = 5, minRow: number = 1) {
    try {
        const credentials = await loadCredentials();
        let cookies = credentials?.[searchPage]?.cookies;

        if (!cookies) {
            Logger.info(`No existing cookies found, fetching new ones`, {
                context: {
                    searchQuery,
                    component: "Auth",
                },
            });
            cookies = await getInitialCookies();
        }

        const formCredentials = credentials?.[searchPage]?.formData;

        // Create FormData instance
        const formData = new FormData();
        formData.append("p_flow_id", formCredentials?.flowId || "");
        formData.append("p_flow_step_id", formCredentials?.flowStepId || "");
        formData.append("p_instance", formCredentials?.instance || "");
        formData.append("p_debug", "");
        formData.append(
            "p_request",
            `PLUGIN=${formCredentials?.companyRegionData?.ajaxIdentifier}`
        );
        formData.append("p_widget_name", "worksheet");
        formData.append("p_widget_mod", "ACTION");
        formData.append("p_widget_action", "PAGE");
        formData.append("p_widget_action_mod", `pgR_min_row=${minRow}max_rows=${perPage}rows_fetched=${perPage}`);
        formData.append("p_widget_num_return", perPage.toString());
        formData.append("x01", formCredentials?.companyRegionData?.worksheetId || "");
        formData.append("x02", formCredentials?.companyRegionData?.reportId || "");
        // Prepare the JSON payload
        const jsonPayload = {
            pageItems: {
                itemsToSubmit: [
                    {
                        n: `P${formCredentials?.flowStepId}_SINGLE_SEARCH`,
                        v: searchQuery,
                    },
                    { n: `P${formCredentials?.flowStepId}_FOOTER`, v: "" },
                    {
                        n: `P${formCredentials?.flowStepId}_COMPANY_NAME`,
                        v: "",
                    },
                    {
                        n: `P${formCredentials?.flowStepId}_NATIONALCODECOMPANY`,
                        v: "",
                    },
                    {
                        n: `P${formCredentials?.flowStepId}_SABTNOCOMPANY`,
                        v: "",
                    },
                ],
                protected: formCredentials?.pPageItemsProtected,
                rowVersion: "",
                formRegionChecksums: [],
            },
            salt: formCredentials?.salt,
        };

        formData.append("p_json", JSON.stringify(jsonPayload));

        const ajaxResponse = await axios.post(
            `${ajaxUrl}${formCredentials?.instance}`,
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

        Logger.info(`Flow ajax company completed`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });

        return ajaxResponse.data;
    } catch (error) {
        Logger.error(`Flow ajax company failed`, {
            context: {
                searchQuery,
                component: "Search",
            },
            error,
        });
        throw error;
    }
}

async function flowAjaxFinal(searchQuery: string) {
    try {
        const credentials = await loadCredentials();
        let cookies = credentials?.[searchPage]?.cookies;

        if (!cookies) {
            Logger.info(`No existing cookies found, fetching new ones`, {
                context: {
                    searchQuery,
                    component: "Auth",
                },
            });
            cookies = await getInitialCookies();
        }

        const formCredentials = credentials?.[searchPage]?.formData;

        // Create FormData instance
        const formData = new FormData();
        formData.append("p_flow_id", formCredentials?.flowId || "");
        formData.append("p_flow_step_id", formCredentials?.flowStepId || "");
        formData.append("p_instance", formCredentials?.instance || "");
        formData.append("p_debug", "");

        // Prepare the JSON payload
        const jsonPayload = {
            regions: [
                {
                    reportId: formCredentials?.gridConfig?.reportId,
                    view: formCredentials?.gridConfig?.view,
                    ajaxColumns: formCredentials?.gridConfig?.ajaxColumns,
                    id: formCredentials?.gridConfig?.id,
                    ajaxIdentifier: formCredentials?.gridConfig?.ajaxIdentifier,
                    fetchData: { version: 1, firstRow: 1, maxRows: 2000 },
                },
            ],
            pageItems: {
                itemsToSubmit: [
                    {
                        n: `P${formCredentials?.flowStepId}_SINGLE_SEARCH`,
                        v: searchQuery,
                    },
                    { n: `P${formCredentials?.flowStepId}_FOOTER`, v: "" },
                ],
                protected: formCredentials?.pPageItemsProtected,
                rowVersion: "",
                formRegionChecksums: [],
            },
            salt: formCredentials?.salt,
        };

        formData.append("p_json", JSON.stringify(jsonPayload));

        const ajaxResponse = await axios.post(
            `${ajaxUrl}${formCredentials?.instance}`,
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

        Logger.info(`Flow ajax final completed`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });

        return ajaxResponse.data;
    } catch (error) {
        Logger.error(`Flow ajax final failed`, {
            context: {
                searchQuery,
                component: "Search",
            },
            error,
        });
        throw error;
    }
}

// Add session management utilities
interface SessionResponse {
    error?: string;
    unsafe?: boolean;
    addInfo?: string;
    pageSubmissionId?: string;
    redirectURL?: string;
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

// Modify executeSearch to accept workerId
export async function executeSearch(searchQuery: string, workerId?: string) {
    const searchContext = {
        searchQuery,
        component: "Search",
        workerId,
    };

    try {
        Logger.info(`Starting search execution`, {
            context: searchContext,
        });

        // Create a folder for this search query
        const queryFolder = await getQueryFolder(searchQuery);

        // Wrap each operation with session retry
        let result = await withSessionRetry(
            () => flowAccept(searchQuery),
            searchContext
        );

        if (result?.redirectURL) {
            const shortUrl = new URL(baseUrl + result.redirectURL).pathname;
            Logger.debug(`Following redirect`, {
                context: {
                    ...searchContext,
                    url: shortUrl,
                },
            });

            await withSessionRetry(
                () => makeRequestAndSaveCredentials(baseUrl + result.redirectURL, searchPage, {
                    headers: {
                        ...CACHE_HEADERS,
                    },
                }),
                searchContext
            );
        }

        let resultAjax2 = await withSessionRetry(
            () => flowAjax2(searchQuery),
            searchContext
        );

        // Check for existing pagination status
        let minRow = 1;
        const perPage = 1000;
        let totalCompanies = 0;
        let isFirstBatch = true;

        // Try to resume from previous state
        const paginationStatus = await getPaginationStatus(searchQuery);
        if (paginationStatus) {
            Logger.info(`Resuming company data extraction from row ${paginationStatus.currentMinRow}`, {
                context: {
                    ...searchContext,
                    component: "CompanyPagination"
                }
            });
            
            minRow = paginationStatus.currentMinRow;
            totalCompanies = paginationStatus.totalProcessed;
            isFirstBatch = paginationStatus.isFirstBatch;
        } else {
            Logger.info(`Starting new company data extraction`, {
                context: {
                    ...searchContext,
                    component: "CompanyPagination"
                }
            });
        }

        while (true) {
            Logger.info(`Fetching companies batch starting from row ${minRow}`, {
                context: {
                    ...searchContext,
                    component: "CompanyPagination"
                }
            });

            let resultAjaxCompany = await withSessionRetry(
                () => flowAjaxCompany(searchQuery, perPage, minRow),
                searchContext
            );

            // Process the batch
            const { processedCount, totalProcessed } = await processCompanyData(
                resultAjaxCompany,
                searchQuery,
                isFirstBatch,
                minRow,
                perPage,
                workerId
            );

            // Clear the response data
            resultAjaxCompany = null;

            totalCompanies = totalProcessed;
            
            // If we got fewer results than requested, we've reached the end
            if (processedCount < perPage) {
                Logger.info(`Completed company data extraction with ${totalCompanies} total companies`, {
                    context: {
                        ...searchContext,
                        component: "CompanyPagination"
                    }
                });
                break;
            }

            // Prepare for next batch
            minRow += perPage;
            isFirstBatch = false;

            // Add a small delay to prevent overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Save minimal search results
        const searchResults = {
            totalCompanies,
        };
        
        await writeJsonFile(`${queryFolder}search_results.json`, searchResults);

        // Clear variables
        result = null;
        resultAjax2 = null;

        Logger.info(`Search execution completed`, {
            context: searchContext,
        });
        
        return searchResults;
    } catch (error) {
        Logger.error(`Search execution failed`, {
            context: searchContext,
            error,
        });
        throw error;
    }
}

// const searchQuery = "ب"
// executeSearch(searchQuery);

// Create readline interface
const rl = readline.createInterface({ input, output });

// Function to prompt for input
const promptInput = (question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
};

// Main async function to handle the flow
async function main() {
    try {
        // Ask for the length of combinations
        const lengthStr = await promptInput('Enter the length of combinations to generate (1-3 recommended): ');
        const length = parseInt(lengthStr);
        
        if (isNaN(length) || length < 1) {
            Logger.error('Invalid input: Please enter a valid positive number', {
                context: {
                    component: "Setup",
                    input: lengthStr
                }
            });
            return;
        }

        // Ask for the number of workers
        const workersStr = await promptInput('Enter the number of parallel workers (1-8 recommended): ');
        const workers = parseInt(workersStr);

        if (isNaN(workers) || workers < 1) {
            Logger.error('Invalid input: Please enter a valid positive number for workers', {
                context: {
                    component: "Setup",
                    input: workersStr
                }
            });
            return;
        }

        // Warn if length is large
        if (length > 3) {
            Logger.warn(`Large combination length detected`, {
                context: {
                    component: "Setup",
                    length,
                    totalCombinations: Math.pow(33, length)
                }
            });
            const confirm = await promptInput('Are you sure you want to continue? (y/n): ');
            
            if (confirm.toLowerCase() !== 'y') {
                return;
            }
        }

        // Generate all combinations
        const allCombinations = generateCombinationsIterative(length);
        const totalCombinations = allCombinations.length;

        // Start workers
        Logger.info(`Initializing worker distribution`, {
            context: {
                component: "WorkerManager",
                workers,
                totalCombinations,
                combinationLength: length
            }
        });
        
        // Distribute combinations among workers
        const combinationsPerWorker = Math.ceil(totalCombinations / workers);
        
        // Process combinations in chunks for each worker
        const workerPromises = Array.from({ length: workers }, (_, i) => {
            const workerId = `Worker-${i}`;
            const startIndex = i * combinationsPerWorker;
            const endIndex = Math.min((i + 1) * combinationsPerWorker, totalCombinations);
            const workerCombinations = allCombinations.slice(startIndex, endIndex);

            Logger.info(`Initializing worker`, {
                context: {
                    component: "WorkerManager",
                    workerId,
                    combinationsAssigned: workerCombinations.length,
                    startIndex,
                    endIndex
                }
            });

            // Process combinations in chunks
            return async function processWorkerCombinations() {
                const CHUNK_SIZE = 10;
                for (let j = 0; j < workerCombinations.length; j += CHUNK_SIZE) {
                    const chunk = workerCombinations.slice(j, Math.min(j + CHUNK_SIZE, workerCombinations.length));
                    for (const combination of chunk) {
                        await executeSearch(combination, workerId);
                    }
                    // Clear the processed chunk
                    chunk.length = 0;
                    
                    // Force garbage collection between chunks
                    if (global.gc) {
                        global.gc();
                    }
                }
            }();
        });

        // Wait for all workers to complete
        await Promise.all(workerPromises);
        
        // Clear the combinations array
        allCombinations.length = 0;
        
        Logger.info('All workers have completed their tasks', {
            context: {
                component: "WorkerManager",
                totalWorkers: workers,
                totalCombinationsProcessed: totalCombinations
            }
        });

    } catch (error) {
        Logger.error('Main process execution failed', {
            context: {
                component: "Main"
            },
            error
        });
    } finally {
        rl.close();
    }
}

// Run the main function
main();
