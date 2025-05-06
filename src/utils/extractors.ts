import { BASE_URL } from "./constants";
import { AjaxResponse, ExtractedInfo } from "./types";
import * as cheerio from "cheerio";

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
 * Extracts specific information from the HTML content
 * @param html The HTML content to parse
 * @returns Object containing the extracted information
 */
export function extractPageInfo(html: string, url: string): ExtractedInfo {
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
  