import {
  ArrowRightLeft, BadgeDollarSign, Banknote, Briefcase, Car, CircleDollarSign,
  Coffee, Fuel, Gamepad2, Gift, GraduationCap, HeartPulse, Home,
  PiggyBank, Plane, ReceiptText, Shapes, ShoppingBag, TrendingUp, Utensils, Wallet,
  type LucideIcon,
} from 'lucide-react-native';

type CategoryVisualInput = { icon?: string | null; name?: string | null; type?: string };
type CategoryVisual = { Icon: LucideIcon; color: string };

const visuals: Record<string, CategoryVisual> = {
  food: { Icon: Utensils, color: '#e5a13a' },
  transport: { Icon: Car, color: '#3997cb' },
  home: { Icon: Home, color: '#dfa640' },
  shopping: { Icon: ShoppingBag, color: '#d95391' },
  health: { Icon: HeartPulse, color: '#e16d79' },
  education: { Icon: GraduationCap, color: '#488fc0' },
  entertainment: { Icon: Gamepad2, color: '#b46ba9' },
  bill: { Icon: ReceiptText, color: '#24b299' },
  wallet: { Icon: Wallet, color: '#31aa84' },
  work: { Icon: Briefcase, color: '#489db2' },
  gift: { Icon: Gift, color: '#d95391' },
  income: { Icon: CircleDollarSign, color: '#24b299' },
  saving: { Icon: PiggyBank, color: '#d69440' },
  travel: { Icon: Plane, color: '#3997cb' },
  cash: { Icon: Banknote, color: '#24b299' },
  salary: { Icon: Banknote, color: '#24b299' },
  bonus: { Icon: BadgeDollarSign, color: '#d69440' },
  investment: { Icon: TrendingUp, color: '#3997cb' },
  fuel: { Icon: Fuel, color: '#d69440' },
  coffee: { Icon: Coffee, color: '#b4825d' },
  transfer: { Icon: ArrowRightLeft, color: '#489db2' },
  other: { Icon: Shapes, color: '#7d8fa1' },
};

const aliases: Record<string, string> = {
  'shopping-cart': 'shopping', 'shopping-bag': 'shopping', cart: 'shopping',
  utensils: 'food', restaurant: 'food', car: 'transport', bus: 'transport',
  house: 'home', 'heart-pulse': 'health', medical: 'health',
  'graduation-cap': 'education', school: 'education', 'gamepad-2': 'entertainment',
  receipt: 'bill', 'receipt-text': 'bill', briefcase: 'work',
  'piggy-bank': 'saving', savings: 'saving', plane: 'travel',
  banknote: 'cash', 'circle-dollar-sign': 'income', 'trending-up': 'investment',
  'gas-pump': 'fuel', 'arrow-right-left': 'transfer',
};

const nameRules: [RegExp, string][] = [
  [/ca phe|cafe|coffee|tra sua/, 'coffee'],
  [/xang|nhien lieu|fuel|petrol|gasoline/, 'fuel'],
  [/an uong|thuc pham|nha hang|food|meal|restaurant|grocer/, 'food'],
  [/giao duc|hoc phi|hoc tap|education|school|tuition/, 'education'],
  [/di chuyen|giao thong|xe|transport|taxi|travel fare/, 'transport'],
  [/mua sam|quan ao|shopping|clothing/, 'shopping'],
  [/suc khoe|y te|benh|thuoc|health|medical/, 'health'],
  [/du lich|travel|vacation/, 'travel'],
  [/nha cua|tien nha|thue nha|housing|rent|home/, 'home'],
  [/hoa don|dien|nuoc|internet|bill|utilities/, 'bill'],
  [/giai tri|entertainment|game|cinema/, 'entertainment'],
  [/tien luong|luong|salary|payroll/, 'salary'],
  [/thuong|bonus/, 'bonus'],
  [/dau tu|investment/, 'investment'],
  [/tiet kiem|saving/, 'saving'],
  [/qua tang|gift/, 'gift'],
  [/cong viec|work|business/, 'work'],
  [/thu nhap|income/, 'income'],
];

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();
}

export function getCategoryVisual({ icon, name, type }: CategoryVisualInput): CategoryVisual {
  if (type === 'TransferIn' || type === 'TransferOut') return visuals.transfer;
  const key = normalize(icon?.trim() ?? '').replace(/[_\s]+/g, '-');
  const explicit = key !== 'other' && visuals[aliases[key] ?? key];
  if (explicit) return explicit;
  const normalizedName = normalize(name ?? '');
  const match = nameRules.find(([pattern]) => pattern.test(normalizedName));
  return visuals[match?.[1] ?? (type === 'Income' ? 'income' : 'other')];
}

export function CategoryIcon({ size = 22, ...category }: CategoryVisualInput & { size?: number }) {
  const { Icon, color } = getCategoryVisual(category);
  return <Icon size={size} color={color} strokeWidth={1.8} />;
}
