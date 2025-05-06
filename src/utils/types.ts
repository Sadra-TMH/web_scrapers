export interface LogContext {
  searchQuery?: string;
  component?: string;
  url?: string;
  workerId?: string;
  currentMinRow?: number;
  totalProcessed?: number;
  // Setup context
  input?: string;
  length?: number;
  totalCombinations?: number;
  // Worker context
  workers?: number;
  combinationLength?: number;
  combinationsAssigned?: number;
  startIndex?: number;
  endIndex?: number;
  totalWorkers?: number;
  totalCombinationsProcessed?: number;
  // Company context
  companyId?: string;
  name?: string;
  registrationNumber?: string;
}

export interface LogOptions {
  context?: LogContext;
  error?: Error | unknown;
}

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
  companyInfo?: {
    ajaxIdentifier: string;
    internalRegionId: string;
  };
}

export interface UrlCredentials {
  cookies?: string;
  formData?: FormDataCredentials;
}

export interface Credentials {
  [url: string]: UrlCredentials;
}

export interface AjaxRequestParams {
  searchQuery?: string;
  getElement: (flowStepId: string) => string;
  getAdditionalItems: (flowStepId: string) => Array<{
    name: string;
    value: string;
  }>;
}

export interface AjaxResponse {
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

export interface ExtractedInfo {
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

// Add these types for status tracking
export interface CompanyPaginationStatus {
  currentMinRow: number;
  perPage: number;
  totalProcessed: number;
  isFirstBatch: boolean;
  lastUpdated: string;
}

export interface CombinationStatus {
  combination: string;
  status: "pending" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  error?: string;
  workerId?: string;
  paginationStatus?: CompanyPaginationStatus;
}

// Add these session management utilities after the existing constants
export interface SessionResponse {
  error?: string;
  unsafe?: boolean;
  addInfo?: string;
  pageSubmissionId?: string;
}

export interface CompanyData {
  companyId: string;
  companyName: string;
  nationalId: string;
  registrationNumber: string;
  postalCode?: string;
  address?: string;
}

export interface ProcessCompanyResult {
  processedCount: number;
  totalProcessed: number;
}


export interface CompanyDetails {
    name: string;
    registrationNumber: string;
    nationalId: string;
    postalCode: string;
    address: string;
  }
  