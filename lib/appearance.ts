export const APPEARANCE_FONTS = [
  {
    id: 'noto-kufi-arabic',
    nameAr: 'Noto Kufi Arabic',
    nameEn: 'Noto Kufi Arabic',
    descriptionAr: 'كوفي هندسي وعصري',
    descriptionEn: 'Geometric, modern Kufi',
    cssFamily: "'Noto Kufi Arabic', sans-serif",
  },
  {
    id: 'reem-kufi',
    nameAr: 'Reem Kufi',
    nameEn: 'Reem Kufi',
    descriptionAr: 'كوفي فني بطابع واضح',
    descriptionEn: 'Expressive Kufi character',
    cssFamily: "'Reem Kufi', sans-serif",
  },
  {
    id: 'amiri',
    nameAr: 'Amiri',
    nameEn: 'Amiri',
    descriptionAr: 'نسخي كلاسيكي',
    descriptionEn: 'Classic Naskh',
    cssFamily: "'Amiri', serif",
  },
  {
    id: 'el-messiri',
    nameAr: 'El Messiri',
    nameEn: 'El Messiri',
    descriptionAr: 'أنيق ومناسب للعناوين',
    descriptionEn: 'Elegant, strong headings',
    cssFamily: "'El Messiri', sans-serif",
  },
  {
    id: 'cairo',
    nameAr: 'Cairo',
    nameEn: 'Cairo',
    descriptionAr: 'هندسي ومتوازن',
    descriptionEn: 'Geometric and balanced',
    cssFamily: "'Cairo', sans-serif",
  },
  {
    id: 'tajawal',
    nameAr: 'Tajawal',
    nameEn: 'Tajawal',
    descriptionAr: 'بسيط وهادئ',
    descriptionEn: 'Simple and calm',
    cssFamily: "'Tajawal', sans-serif",
  },
  {
    id: 'ibm-plex-sans-arabic',
    nameAr: 'IBM Plex Sans Arabic',
    nameEn: 'IBM Plex Sans Arabic',
    descriptionAr: 'تقني وواضح — الافتراضي',
    descriptionEn: 'Technical and clear — default',
    cssFamily: "'IBM Plex Sans Arabic', sans-serif",
  },
  {
    id: 'noto-sans-arabic',
    nameAr: 'Noto Sans Arabic',
    nameEn: 'Noto Sans Arabic',
    descriptionAr: 'محايد ومريح للقراءة',
    descriptionEn: 'Neutral and readable',
    cssFamily: "'Noto Sans Arabic', sans-serif",
  },
] as const

export type AppearanceFontFamily = typeof APPEARANCE_FONTS[number]['id']
export type CardSize = 'small' | 'medium' | 'large'

export const DEFAULT_APPEARANCE = {
  fontFamily: 'ibm-plex-sans-arabic',
  fontSize: 16,
  cardSize: 'medium',
} as const

export function isAppearanceFontFamily(value: unknown): value is AppearanceFontFamily {
  return typeof value === 'string' && APPEARANCE_FONTS.some(font => font.id === value)
}

export function normalizeFontSize(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 14 && value <= 24
    ? value
    : DEFAULT_APPEARANCE.fontSize
}

export function normalizeCardSize(value: unknown): CardSize {
  return value === 'small' || value === 'medium' || value === 'large'
    ? value
    : DEFAULT_APPEARANCE.cardSize
}
