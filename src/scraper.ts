import * as cheerio from "cheerio";
import axios from "axios";
import FormData from "form-data";
import {
    FILE_DIR_PREFIX,
    writeFile,
    writeJsonFile,
    saveCredentials,
    loadCredentials,
} from "./fileUtils.js";
import {
    COMMON_HEADERS,
    POST_HEADERS,
    CACHE_HEADERS,
    searchPage,
    baseUrl,
    searchUrl,
    ajaxUrl,
    homeUrl,
} from "./utils.js";
import { extractFormCredentials } from "./utils.js";
import { handleAjaxFlow } from "./utils.js";

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

        // console.log("existingCookies: ", credentials);
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
        console.error(`Error in request to ${url}:`, error);
        throw error;
    }
}

async function getInitialCookies(): Promise<string> {
    try {
        const initialUrl = homeUrl;

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
        console.error("Error getting initial cookies:", error);
        throw error;
    }
}

async function flowAccept(searchQuery: string) {
    try {
        // Get credentials - either load existing or fetch new ones
        const credentials = await loadCredentials();
        // console.log("loaded credentials: ", credentials);
        let cookies = credentials?.[searchPage]?.cookies;

        if (!cookies) {
            console.log("No existing cookies found, fetching new ones...");
            cookies = await getInitialCookies();
        }

        const formCredentials = credentials?.[searchPage]?.formData;

        // Create FormData instance
        const formData = new FormData();
        formData.append("p_flow_id", formCredentials?.flowId);
        formData.append("p_flow_step_id", formCredentials?.flowStepId);
        formData.append("p_instance", formCredentials?.instance);
        formData.append("p_debug", "");
        formData.append("p_request", "SEARCH");
        formData.append("p_reload_on_submit", "S");
        formData.append(
            "p_page_submission_id",
            formCredentials?.pageSubmissionId || ""
        );

        const flowStepId = formCredentials?.flowStepId;
        // Prepare the JSON payload
        const jsonPayload = {
            pageItems: {
                itemsToSubmit: [
                    { n: `P${flowStepId}_SINGLE_SEARCH`, v: searchQuery },
                    { n: `P${flowStepId}_SINGLE_SEARCH_1`, v: "" },
                    {
                        n: "P0_CURRENT_PAGE_ID",
                        v: formCredentials?.currentPageId?.value,
                        ck: formCredentials?.currentPageId?.ck,
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
                        v: formCredentials?.orderId?.value,
                        ck: formCredentials?.orderId?.ck,
                    },
                    { n: "P0_ORDER_PRICE", v: "" },
                    { n: "P0_BANNER", v: "" },
                    { n: "P0_LINK_BANNER", v: "" },
                    {
                        n: "P0_TOOLTIP_BANNER",
                        v: formCredentials?.tooltipBanner?.value,
                        ck: formCredentials?.tooltipBanner?.ck,
                    },
                    { n: "P0_CURRENTDATE", v: "" },
                    { n: "P0_MT", v: "" },
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
                protected: formCredentials?.pPageItemsProtected,
                rowVersion: "",
                formRegionChecksums: [],
            },
            salt: formCredentials?.salt,
        };

        formData.append("p_json", JSON.stringify(jsonPayload));

        const searchResponse = await axios.post(
            `${searchUrl}${formCredentials?.instance}`,
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

        // Save the response data using the new utility functions
        await writeJsonFile(
            FILE_DIR_PREFIX + "response_search.json",
            searchResponse.data
        );
        // await writeFile(
        //     FILE_DIR_PREFIX + "response_search.html",
        //     searchResponse.data
        // );

        console.log("Data has been successfully fetched and saved");

        return searchResponse.data;
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

async function flowAjax1(searchQuery: string) {
    try {
        const response = await handleAjaxFlow({
            getElement: (flowStepId) => `P${flowStepId}_FOOTER`,
            getAdditionalItems: (flowStepId) => [
                {
                    name: `P${flowStepId}_FOOTER`,
                    value: "",
                },
                {
                    name: `P${flowStepId}_FOOTER_1`,
                    value: "",
                },
            ],
        });

        // Save the response data
        await writeJsonFile(FILE_DIR_PREFIX + "response_ajax1.json", response);
        console.log("Data has been successfully fetched and saved");

        return response;
    } catch (error) {
        console.error("Error in flowAjax1:", error);
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

        // Save the response data
        await writeJsonFile(FILE_DIR_PREFIX + "response_ajax2.json", response);
        console.log("Data has been successfully fetched and saved");

        return response;
    } catch (error) {
        console.error("Error in flowAjax2:", error);
        throw error;
    }
}

async function flowAjax3(searchQuery: string) {
    try {
        const response = await handleAjaxFlow({
            getElement: (flowStepId) => `P${flowStepId}_FOOTER`,
            getAdditionalItems: (flowStepId) => [
                {
                    name: `P${flowStepId}_FOOTER`,
                    value: "",
                },
                {
                    name: `P${flowStepId}_FOOTER_2`,
                    value: "",
                },
            ],
        });

        // Save the response data
        await writeJsonFile(FILE_DIR_PREFIX + "response_ajax3.json", response);
        console.log("Data has been successfully fetched and saved");

        return response;
    } catch (error) {
        console.error("Error in flowAjax1:", error);
        throw error;
    }
}

async function flowAjaxFinal(searchQuery: string) {
    try {
        // Get credentials - either load existing or fetch new ones
        const credentials = await loadCredentials();
        // console.log("loaded credentials: ", credentials);
        let cookies = credentials?.[searchPage]?.cookies;

        if (!cookies) {
            console.log("No existing cookies found, fetching new ones...");
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
                    fetchData: { version: 1, firstRow: 1, maxRows: 1000 },
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
            }
        );

        // Save the response data using the new utility functions
        await writeJsonFile(
            FILE_DIR_PREFIX + "response_ajax.json",
            ajaxResponse.data
        );

        console.log("Data has been successfully fetched and saved");

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
// Execute the function
const searchQuery = "kk";
const result = await flowAccept(searchQuery);
console.log("result: ", result);

if (result?.redirectURL) {
    await makeRequestAndSaveCredentials(
        `${baseUrl}${result.redirectURL}`,
        searchPage,
        {
            headers: {
                ...CACHE_HEADERS,
            },
        }
    );
}

const resultAjax1 = await flowAjax1(searchQuery);
console.log("resultAjax1: ", resultAjax1);

const resultAjax2 = await flowAjax2(searchQuery);
console.log("resultAjax2: ", resultAjax2);

const resultAjax3 = await flowAjax3(searchQuery);
console.log("resultAjax3: ", resultAjax3);

const resultAjax = await flowAjaxFinal(searchQuery);
console.log("resultAjax: ", resultAjax);
