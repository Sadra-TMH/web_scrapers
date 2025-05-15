interface ExtractedData {
  companyName: string;
  registrationNumber: string;
  registrationDate: string;
  companyType: string;
  businessScope: string[];
  capital: number;
  address: string;
  postalCode: string;
  nationalIds: string[];
  phoneNumbers: string[];
  registrationAuthority: string;
}

export function extractCompanyName(text: string): string {
  const companyNameMatch = text.match(/شرکت\s+([^(]+)/);
  return companyNameMatch ? companyNameMatch[1].trim() : '';
}

export function extractRegistrationNumber(text: string): string {
  const regNumberMatch = text.match(/شماره\s+ثبت\s+(\d+)/);
  return regNumberMatch ? regNumberMatch[1] : '';
}

export function extractRegistrationDate(text: string): string {
  const dateMatch = text.match(/تاریخ\s+(\d{2}\/\d{2}\/\d{4})/);
  return dateMatch ? dateMatch[1] : '';
}

export function extractCompanyType(text: string): string {
  const typeMatch = text.match(/شرکت\s+([^(]+)\s*\(([^)]+)\)/);
  return typeMatch ? typeMatch[2].trim() : '';
}

export function extractBusinessScope(text: string): string[] {
  const scopeMatch = text.match(/موضوع\s+شرکت:\s*([^2]+)/);
  if (!scopeMatch) return [];
  
  return scopeMatch[1]
    .split(/[.,]/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

export function extractCapital(text: string): number {
  const capitalMatch = text.match(/سرمایه\s+شرکت:\s*مبلغ\s+(\d+)\s+ریال/);
  return capitalMatch ? parseInt(capitalMatch[1]) : 0;
}

export function extractAddress(text: string): string {
  const addressMatch = text.match(/مرکز\s+اصلی\s+شرکت:\s*([^,]+)/);
  return addressMatch ? addressMatch[1].trim() : '';
}

export function extractPostalCode(text: string): string {
  const postalMatch = text.match(/کد\s+پستی\s+(\d+)/);
  return postalMatch ? postalMatch[1] : '';
}

export function extractNationalIds(text: string): string[] {
  const nationalIdRegex = /\b\d{10}\b/g;
  return text.match(nationalIdRegex) || [];
}

export function extractPhoneNumbers(text: string): string[] {
  const phoneRegex = /\b\d{11}\b/g;
  return text.match(phoneRegex) || [];
}

export function extractRegistrationAuthority(text: string): string {
  const authorityMatch = text.match(/سازمان\s+([^,]+)/);
  return authorityMatch ? authorityMatch[1].trim() : '';
}

export function preprocessLegalNote(text: string): ExtractedData {
  return {
    companyName: extractCompanyName(text),
    registrationNumber: extractRegistrationNumber(text),
    registrationDate: extractRegistrationDate(text),
    companyType: extractCompanyType(text),
    businessScope: extractBusinessScope(text),
    capital: extractCapital(text),
    address: extractAddress(text),
    postalCode: extractPostalCode(text),
    nationalIds: extractNationalIds(text),
    phoneNumbers: extractPhoneNumbers(text),
    registrationAuthority: extractRegistrationAuthority(text)
  };
}

export function preprocessCSVRow(row: any): ExtractedData {
  const legalNote = row['legal_note'] || '';
  return preprocessLegalNote(legalNote);
}

const note = "آگهی تأسیس شرکت ایمن سپهر تجارت اروند(با مسئولیت محدود) به شماره ثبت 6686 خلاصه شرکتنامه و اساسنامه شرکت ایمن سپهر تجارت اروند} (با مسئولیت محدود) که در تاریخ30/11/1396 تحت شماره 6686 در این اداره به ثبت رسیده و در تاریخ 30/11/1396 از لحاظ امضاء ذیل ثبت تکمیل گردیده برای اطلاع عموم در روزنامه رسمی و کثیرالانتشار آگهی می شود 1) موضوع شرکت: صادرات واردات کلیه کالاهای مجاز واردات خودرو های سبک و سنگین وراهسازی و کشاورزی وکلیه قطعات خودرویی.واردات مواد غذایی شامل گوشت، مرغ، تخم مرغ، دام زنده وطیور، مواد پتروشیمیایی، انواع ماهیها وآبزیان انواع کود وسموم، گندموجو، ، مصالح ساختمانی و شیرالات، لوازم برقی.اسباب بازی وسایل یدکی ماشین آ لات سبک وسنگین، انواع خودرو سبک وسنگین پارچه، فرش و مواد نساجی پوشاک کیف وکفش.. شرکت در مناقصات تامین غذا برای سازمانهای دولتی و خصوصی. تامین نیروی انسانی، اداری و خدماتی. شرکت در مناقصات و مزایدات سازمانها وادارات دولتی وغیر دولتی.افتتاح حساب و اخذ ضمانتنامه های بانکی واخذ هر گونه مجوزات لازم در راستای فعالیت شرکت عند اللزوم 2) مدت شرکت: از تاریخ ثبت به مدت نامحدود. 3) مرکز اصلی شرکت: خرمشهر محله سنتاب معبر آخر کوچه فرعی 1 معبر آخر خیابان صیحا طبقه همکف, کد پستی 6415731441 4) سرمایه شرکت:مبلغ 100000000 ریال نقدی که نزد مدیرعامل می باشد. 5) اولین مدیران شرکت:آقا / خانم حمید مزرعه با کد ملی 1989621937 به سمت مدیرعامل و رئیس هیت مدیره و آقا / خانم مریم سیاحی با کد ملی 1989563120 به سمت نایب رئیس هیت مدیره برای مدت نامحدود انتخاب شدند. 6) دارندگان حق امضاء:کلیه اسناد و اوراق بهادار و تعهد آور و تجاری و بانکی شرکت از قبیل چک، سفته و بروات و عقود اسلامی و قرارداد ها و مکاتبات عادی و اداری با امضا منفرد مدیرعامل و رئیس هیت مدیره همراه با مهر شرکت معتبر می باشد ش961227447962757 سازمان منطقه آزاد سازمان منطقه آزاد اروند"
console.log(preprocessLegalNote(note))
