import fs from "fs/promises";
import * as cheerio from "cheerio";
import { writeJsonFile } from "./fileUtils";
import { FILE_DIR_PREFIX } from "./fileUtils";

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
                                credentials.ajaxIdentifiers[element] = identifier;
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
