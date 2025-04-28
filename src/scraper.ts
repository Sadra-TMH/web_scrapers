import axios from "axios";
import FormData from "form-data";
import {
    writeJsonFile,
    saveCredentials,
    loadCredentials,
    writeFile,
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
} from "./utils/utils.js";
import { extractFormCredentials } from "./utils/utils.js";
import { handleAjaxFlow } from "./utils/utils.js";
import { extractAndSaveUrls } from "./utils/utils.js";

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

        Logger.info(`Flow ajax1 completed`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });

        return response;
    } catch (error) {
        Logger.error(`Flow ajax1 failed`, {
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

        Logger.info(`Flow ajax3 completed`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });

        return response;
    } catch (error) {
        Logger.error(`Flow ajax3 failed`, {
            context: {
                searchQuery,
                component: "Search",
            },
            error,
        });
        throw error;
    }
}

async function flowAjaxCompany(searchQuery: string) {
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
        formData.append("p_widget_mod", "PULL");
        formData.append("p_widget_num_return", "5");
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
                    fetchData: { version: 1, firstRow: 1, maxRows: 2 },
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

async function executeSearch(searchQuery: string) {
    try {
        Logger.info(`Starting search execution`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });

        // Create a folder for this search query
        const queryFolder = await getQueryFolder(searchQuery);

        const result = await flowAccept(searchQuery);
        // await writeJsonFile(`${queryFolder}response_search.json`, result);

        // If there's a redirect URL, fetch and save its HTML content
        if (result?.redirectURL) {
            const redirectUrl = `${baseUrl}${result.redirectURL}`;
            Logger.debug(`Following redirect`, {
                context: {
                    searchQuery,
                    component: "Search",
                    url: redirectUrl,
                },
            });

            const redirectReponse = await makeRequestAndSaveCredentials(redirectUrl, searchPage, {
                headers: {
                    ...CACHE_HEADERS,
                },
            });
            const redirectResult = redirectReponse.response.data;
            // await writeFile(`${queryFolder}response_redirect.html`, redirectResult);
        }

        // const resultAjax1 = await flowAjax1(searchQuery);
        // console.log("resultAjax1: ", resultAjax1);
        // await writeJsonFile(`${queryFolder}response_ajax1.json`, resultAjax1);

        const resultAjax2 = await flowAjax2(searchQuery);
        // await writeJsonFile(`${queryFolder}response_ajax2.json`, resultAjax2);

        // const resultAjax3 = await flowAjax3(searchQuery);
        // console.log("resultAjax3: ", resultAjax3);
        // await writeJsonFile(`${queryFolder}response_ajax3.json`, resultAjax3);

        const resultAjax = await flowAjaxFinal(searchQuery);

        // Extract and save URLs from the final AJAX response
        const extractedUrls = await extractAndSaveUrls(resultAjax, searchQuery);
        Logger.info(`URL extraction completed`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });

        const processedUrls = await processExtractedUrls(
            extractedUrls,
            searchQuery
        );

        const resultAjaxCompany = await flowAjaxCompany(searchQuery);
        await writeFile(`${queryFolder}response_ajax_company.html`, resultAjaxCompany);

        const searchResults = {
            initialResult: result,
            ajax2: resultAjax2,
            ajaxFinal: resultAjax,
            extractedUrls,
            processedUrls,
            resultAjaxCompany,
        };
        await writeJsonFile(`${queryFolder}search_results.json`, searchResults);

        Logger.info(`Search execution completed`, {
            context: {
                searchQuery,
                component: "Search",
            },
        });
    } catch (error) {
        Logger.error(`Search execution failed`, {
            context: {
                searchQuery,
                component: "Search",
            },
            error,
        });
        throw error;
    }
}

const searchQuery = "تست";
executeSearch(searchQuery);
// const url ="https://rrk.ir/ords/r/rrs/rrs-front/f-detail-ad?p28_code=16013058&p28_from_page=155&clear=28&session=3366973607923&cs=3ZLWom0HlPEkSEs3J257Pg4R5qMH5R4PRUnzjn0kyfJitFMm0MATo5-7umebjt84gKzzS14rWG04QDHTZMA7xLQ";
// fetchAndSaveHtml(url, searchQuery, "infotest");
