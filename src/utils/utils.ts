import fs from "fs/promises";
import * as cheerio from "cheerio";
import { writeJsonFile, saveCredentials } from "./fileUtils";
import { FILE_DIR_PREFIX } from "./fileUtils";
import axios from "axios";
import FormData from "form-data";
import {
  AjaxRequestParams,
  AjaxResponse,
  CombinationStatus,
  CompanyData,
  CompanyPaginationStatus,
  Credentials,
  ExtractedInfo,
  FormDataCredentials,
  ProcessCompanyResult,
  CompanyDetails,
} from "./types";
import { Logger } from "./logger";
import {
  SEARCH_PAGE,
  AJAX_URL,
  BASE_URL,
  CACHE_HEADERS,
  COMMON_HEADERS,
  POST_HEADERS,
  CREDENTIALS_FILE,
  MAX_RETRIES,
  RETRY_DELAY,
  TIMEOUT,
} from "./constants";

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
  credentials.pageSubmissionId = getValue('input[name="p_page_submission_id"]');
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
      const scriptWithRegionId = $(`script:contains("${regionId}")`).text();
      if (scriptWithRegionId) {
        const configMatch = scriptWithRegionId.match(
          /interactiveReport\((.*?)\);/s
        );

        if (configMatch) {
          const configStr = configMatch[1];
          const config = JSON.parse(configStr);
          credentials.companyRegionData.ajaxIdentifier = config.ajaxIdentifier;
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
            while ((match = ajaxIdentifierRegex.exec(eventListStr)) !== null) {
              const element = match[1];
              const identifier = match[2];

              if (element && identifier) {
                credentials.ajaxIdentifiers[element] = identifier;
              }
            }

            // Also look for triggering elements
            const triggerRegex =
              /"triggeringElement"\s*:\s*"([^"]+)"[^}]*"ajaxIdentifier"\s*:\s*"([^"]+)"/g;

            while ((match = triggerRegex.exec(eventListStr)) !== null) {
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

    // Try to extract company info from script tags
    const companyInfoScript = $('script:contains("internalRegionId")').text();

    if (companyInfoScript) {
      // Updated regex patterns to match the actual script structure
      const ajaxIdentifierMatch = companyInfoScript.match(
        /apex\.widget\.report\.init\(\s*"[^"]+",\s*"([^"]+)"/
      );
      const internalRegionIdMatch = companyInfoScript.match(
        /"internalRegionId":"(\d+)"/
      );

      if (ajaxIdentifierMatch && internalRegionIdMatch) {
        credentials.companyInfo = {
          ajaxIdentifier: parseEncodedString(ajaxIdentifierMatch[1]),
          internalRegionId: internalRegionIdMatch[1],
        };

        Logger.debug(`Extracted company info credentials`, {
          context: {
            component: "Credentials",
          },
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
    let cookies = credentials?.[SEARCH_PAGE]?.cookies;

    if (!cookies) {
      console.log("No existing cookies found, fetching new ones...");
      cookies = await getInitialCookies();
    }

    const formCredentials = credentials?.[SEARCH_PAGE]?.formData;
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
      throw new Error(`No AJAX identifier found for element: ${elementId}`);
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
      `${AJAX_URL}${formCredentials.instance}`,
      formData,
      {
        headers: {
          ...COMMON_HEADERS,
          ...POST_HEADERS,
          ...formData.getHeaders(),
          Referer: BASE_URL,
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
    const data = await fs.readFile(FILE_DIR_PREFIX + CREDENTIALS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading credentials:", error);
    return {};
  }
}

export async function getInitialCookies(): Promise<string> {
  try {
    const response = await axios.get(SEARCH_PAGE, {
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
            const absoluteUrl = url.startsWith("/") ? `${BASE_URL}${url}` : url;
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

// Add this utility function for delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      let cookies = credentials?.[SEARCH_PAGE]?.cookies;

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
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
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
        throw new Error(
          `Failed after ${MAX_RETRIES} attempts: ${lastError.message}`
        );
      }

      // If it's a network error or 5xx error, wait before retrying
      if (
        axios.isAxiosError(error) &&
        (error.code === "ECONNABORTED" ||
          error.code === "ETIMEDOUT" ||
          error.code === "ECONNRESET" ||
          (error.response?.status && error.response.status >= 500))
      ) {
        await delay(RETRY_DELAY * attempt); // Exponential backoff
        continue;
      }

      // If it's not a retryable error, throw immediately
      throw error;
    }
  }

  // This should never be reached due to the throw in the loop
  throw lastError || new Error("Unknown error occurred");
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
    const startRow = shouldAddHeaders ? 1 : await getCurrentRowCount(filePath);
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

  Logger.info(
    `Processing completed. Success: ${successCount}, Failures: ${errors.length}`,
    {
      context: {
        searchQuery,
        component: "URLProcessor",
        workerId,
      },
    }
  );

  return successCount;
}

export function generateCombinationsIterative(maxLength: number): string[] {
  const persianLetters = [
    "آ",
    "ا",
    "ب",
    "پ",
    "ت",
    "ث",
    "ج",
    "چ",
    "ح",
    "خ",
    "د",
    "ذ",
    "ر",
    "ز",
    "ژ",
    "س",
    "ش",
    "ص",
    "ض",
    "ط",
    "ظ",
    "ع",
    "غ",
    "ف",
    "ق",
    "ک",
    "گ",
    "ل",
    "م",
    "ن",
    "و",
    "ه",
    "ی",
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

async function updatePaginationStatus(
  searchQuery: string,
  paginationData: CompanyPaginationStatus
): Promise<void> {
  try {
    const queryFolder = await getQueryFolder(searchQuery);
    const statusPath = `${queryFolder}status.json`;

    // Read existing status
    let status: CombinationStatus;
    try {
      const statusContent = await fs.readFile(statusPath, "utf-8");
      status = JSON.parse(statusContent);
    } catch {
      status = {
        combination: searchQuery,
        status: "pending",
        startedAt: new Date().toISOString(),
      };
    }

    // Update with pagination data
    status.paginationStatus = {
      ...paginationData,
      lastUpdated: new Date().toISOString(),
    };

    // Write updated status
    await writeJsonFile(statusPath, status);

    Logger.debug(`Updated pagination status`, {
      context: {
        searchQuery,
        component: "StatusManager",
        currentMinRow: paginationData.currentMinRow,
        totalProcessed: paginationData.totalProcessed,
      },
    });
  } catch (error) {
    Logger.error(`Failed to update pagination status`, {
      context: {
        searchQuery,
        component: "StatusManager",
      },
      error,
    });
  }
}

export async function getPaginationStatus(
  searchQuery: string
): Promise<CompanyPaginationStatus | null> {
  try {
    const queryFolder = await getQueryFolder(searchQuery);
    const statusPath = `${queryFolder}status.json`;

    const statusContent = await fs.readFile(statusPath, "utf-8");
    const status: CombinationStatus = JSON.parse(statusContent);

    return status.paginationStatus || null;
  } catch {
    return null;
  }
}

export async function processCompanyData(
  html: string,
  searchQuery: string,
  isFirstBatch: boolean,
  currentMinRow: number,
  perPage: number,
  workerId?: string
): Promise<ProcessCompanyResult> {
  try {
    const $ = cheerio.load(html);
    const companies: CompanyData[] = [];

    // Find all table rows except the header row
    const rows = $("table.a-IRR-table tr").not(":first-child");

    // Process each row and fetch additional details
    for (const row of rows.toArray()) {
      const $row = $(row);
      const $companyLink = $row.find("td:first-child a.COMPANY");

      if ($companyLink.length) {
        const basicInfo: CompanyData = {
          companyId: $companyLink.attr("id") || "",
          companyName: $companyLink.text().trim(),
          nationalId: $row.find("td:nth-child(2)").text().trim(),
          registrationNumber: $row.find("td:nth-child(3)").text().trim(),
        };

        try {
          const additionalInfo = await flowAjaxCompanyInfo(
            basicInfo.companyId,
            searchQuery
          );
          if (additionalInfo) {
            basicInfo.postalCode = additionalInfo.postalCode;
            basicInfo.address = additionalInfo.address;
          }
        } catch (error) {
          Logger.warn(
            `Failed to fetch additional details for company ${basicInfo.companyId}`,
            {
              context: {
                searchQuery,
                component: "CompanyDataProcessor",
                workerId,
              },
              error,
            }
          );
        }

        companies.push(basicInfo);
      }
    }

    // Clear cheerio's internal cache
    $.root().empty();
    rows.length = 0;
    let parser = null;

    if (companies.length === 0) {
      Logger.warn(`No company data found in HTML`, {
        context: {
          searchQuery,
          component: "CompanyDataProcessor",
          workerId,
        },
      });
      return { processedCount: 0, totalProcessed: 0 };
    }

    // Create the query folder and CSV file path
    const queryFolder = await getQueryFolder(searchQuery);
    const csvFilePath = `${queryFolder}company_data.csv`;

    // Get current total if file exists
    let currentTotal = 0;
    if (!isFirstBatch) {
      try {
        let fileContent = await fs.readFile(csvFilePath, "utf-8");
        currentTotal = fileContent.split("\n").length - 2;
        fileContent = ""; // Release memory
      } catch {
        currentTotal = 0;
      }
    }

    // Prepare CSV content
    let csvContent = "";
    if (isFirstBatch) {
      const headers = [
        "CompanyId",
        "CompanyName",
        "NationalId",
        "RegistrationNumber",
        "PostalCode",
        "Address",
      ];
      csvContent = headers.join(",") + "\n";
    }

    // Process companies in smaller chunks to manage memory
    const CHUNK_SIZE = 50;
    for (let i = 0; i < companies.length; i += CHUNK_SIZE) {
      const chunk = companies.slice(i, i + CHUNK_SIZE);
      const chunkContent =
        chunk
          .map((company) =>
            [
              company.companyId,
              `"${company.companyName.replace(/"/g, '""')}"`,
              company.nationalId,
              company.registrationNumber,
              `"${(company.postalCode || "").replace(/"/g, '""')}"`,
              `"${(company.address || "").replace(/"/g, '""')}"`,
            ].join(",")
          )
          .join("\n") + "\n";

      // Append chunk directly to file
      await fs.appendFile(
        csvFilePath,
        isFirstBatch && i === 0 ? csvContent + chunkContent : chunkContent
      );
    }

    const processedCount = companies.length;
    const totalProcessed = currentTotal + processedCount;

    // Clear arrays
    companies.length = 0;
    csvContent = "";

    // Update pagination status
    await updatePaginationStatus(searchQuery, {
      currentMinRow,
      perPage,
      totalProcessed,
      isFirstBatch,
      lastUpdated: new Date().toISOString(),
    });

    Logger.info(
      `Processed batch of ${processedCount} companies (Total: ${totalProcessed})`,
      {
        context: {
          searchQuery,
          component: "CompanyDataProcessor",
          workerId,
        },
      }
    );

    return {
      processedCount,
      totalProcessed,
    };
  } catch (error) {
    Logger.error(`Failed to process company data`, {
      context: {
        searchQuery,
        component: "CompanyDataProcessor",
        workerId,
      },
      error,
    });
    throw error;
  }
}

function extractCompanyDetails(html: string): CompanyDetails | null {
  try {
    const $ = cheerio.load(html);
    const details = {
      name: $('td[headers="NAME"]').text().trim(),
      registrationNumber: $('td[headers="SABTNUMBER"]').text().trim(),
      nationalId: $('td[headers="SABTNATIONALID"]').text().trim(),
      postalCode: $('td[headers="POSTALCODE"]').text().trim(),
      address: $('td[headers="ADDRESS"]').text().trim(),
    };
    return details;
  } catch (error) {
    Logger.error(`Failed to extract company details from HTML`, {
      context: {
        component: "CompanyDetails",
      },
      error,
    });
    return null;
  }
}

async function flowAjaxCompanyInfo(
  companyId: string,
  searchQuery: string
): Promise<CompanyDetails | null> {
  const context = {
    component: "CompanyInfo",
    searchQuery,
    companyId,
  };

  try {
    const credentials = await loadCredentials();
    let cookies = credentials?.[SEARCH_PAGE]?.cookies;

    if (!cookies) {
      Logger.info(`No existing cookies found, fetching new ones`, { context });
      cookies = await getInitialCookies();
    }

    const formCredentials = credentials?.[SEARCH_PAGE]?.formData;
    if (!formCredentials?.companyInfo) {
      Logger.error(`Missing company info credentials`, { context });
      return null;
    }

    // Create FormData instance
    const formData = new FormData();
    formData.append("p_flow_id", formCredentials?.flowId || "");
    formData.append("p_flow_step_id", formCredentials?.flowStepId || "");
    formData.append("p_instance", formCredentials?.instance || "");
    formData.append("p_debug", "");
    formData.append(
      "p_request",
      `PLUGIN=${formCredentials?.companyInfo?.ajaxIdentifier}`
    );
    formData.append("p_widget_action", "reset");
    formData.append(
      "x01",
      formCredentials?.companyInfo?.internalRegionId || ""
    );

    // Prepare the JSON payload
    const jsonPayload = {
      pageItems: {
        itemsToSubmit: [
          {
            n: `P${formCredentials?.flowStepId}_COMPANY_CODE`,
            v: companyId,
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
      `${AJAX_URL}${formCredentials?.instance}`,
      formData,
      {
        headers: {
          ...COMMON_HEADERS,
          ...POST_HEADERS,
          ...formData.getHeaders(),
          Referer: BASE_URL,
          Cookie: cookies,
        },
        maxRedirects: 5,
        timeout: TIMEOUT,
      }
    );

    if (!ajaxResponse.data) {
      Logger.warn(`No data received from company info request`, { context });
      return null;
    }

    const details = extractCompanyDetails(ajaxResponse.data);
    if (details) {
      Logger.info(
        `Successfully extracted company details for id: ${companyId}`,
        {
          context,
        }
      );
    }

    return details;
  } catch (error) {
    Logger.error(`Failed to fetch company info`, {
      context,
      error,
    });
    throw error;
  }
}

async function isSessionExpired(response: any): Promise<boolean> {
  if (typeof response === "object" && response !== null) {
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

export async function withSessionRetry<T>(
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
    if (
      axios.isAxiosError(error) &&
      error.response?.data &&
      (await isSessionExpired(error.response.data))
    ) {
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
