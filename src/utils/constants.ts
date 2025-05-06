// URLs
export const BASE_URL = "https://rrk.ir";
export const SEARCH_PAGE = `${BASE_URL}/ords/r/rrs/rrs-front/big_data11`;
export const SEARCH_URL = `${BASE_URL}/ords/wwv_flow.accept?p_context=rrs-front/big_data11/`;
export const AJAX_URL = `${BASE_URL}/ords/wwv_flow.ajax?p_context=rrs-front/big_data11/`;
export const HOME_URL = `${BASE_URL}/ords/r/rrs/rrs-front/home`;
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
  Origin: BASE_URL,
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  Referer: BASE_URL,
};