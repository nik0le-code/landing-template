/**
 * Curated icon set addressable by name, so copy in JSON/DB can say `"icon": "zap"`.
 * Only icons listed here end up in the build — add more from https://lucide.dev/icons
 * (import path: `@lucide/astro/icons/<name>`).
 */
import ArrowRight from "@lucide/astro/icons/arrow-right";
import Award from "@lucide/astro/icons/award";
import Bell from "@lucide/astro/icons/bell";
import Briefcase from "@lucide/astro/icons/briefcase";
import Calendar from "@lucide/astro/icons/calendar";
import ChartColumn from "@lucide/astro/icons/chart-column";
import Check from "@lucide/astro/icons/check";
import CircleCheck from "@lucide/astro/icons/circle-check";
import Clock from "@lucide/astro/icons/clock";
import Cloud from "@lucide/astro/icons/cloud";
import Code from "@lucide/astro/icons/code";
import CreditCard from "@lucide/astro/icons/credit-card";
import FileText from "@lucide/astro/icons/file-text";
import Gauge from "@lucide/astro/icons/gauge";
import Globe from "@lucide/astro/icons/globe";
import Headphones from "@lucide/astro/icons/headphones";
import Heart from "@lucide/astro/icons/heart";
import Image from "@lucide/astro/icons/image";
import Layers from "@lucide/astro/icons/layers";
import LayoutDashboard from "@lucide/astro/icons/layout-dashboard";
import Leaf from "@lucide/astro/icons/leaf";
import Lock from "@lucide/astro/icons/lock";
import Mail from "@lucide/astro/icons/mail";
import MapPin from "@lucide/astro/icons/map-pin";
import MessageCircle from "@lucide/astro/icons/message-circle";
import Minus from "@lucide/astro/icons/minus";
import Phone from "@lucide/astro/icons/phone";
import Plus from "@lucide/astro/icons/plus";
import Quote from "@lucide/astro/icons/quote";
import Rocket from "@lucide/astro/icons/rocket";
import Search from "@lucide/astro/icons/search";
import Settings from "@lucide/astro/icons/settings";
import ShieldCheck from "@lucide/astro/icons/shield-check";
import Smartphone from "@lucide/astro/icons/smartphone";
import Sparkles from "@lucide/astro/icons/sparkles";
import Star from "@lucide/astro/icons/star";
import Target from "@lucide/astro/icons/target";
import TrendingUp from "@lucide/astro/icons/trending-up";
import Users from "@lucide/astro/icons/users";
import Wrench from "@lucide/astro/icons/wrench";
import Zap from "@lucide/astro/icons/zap";

export const icons = {
  "arrow-right": ArrowRight,
  "award": Award,
  "bell": Bell,
  "briefcase": Briefcase,
  "calendar": Calendar,
  "chart-column": ChartColumn,
  "check": Check,
  "circle-check": CircleCheck,
  "clock": Clock,
  "cloud": Cloud,
  "code": Code,
  "credit-card": CreditCard,
  "file-text": FileText,
  "gauge": Gauge,
  "globe": Globe,
  "headphones": Headphones,
  "heart": Heart,
  "image": Image,
  "layers": Layers,
  "layout-dashboard": LayoutDashboard,
  "leaf": Leaf,
  "lock": Lock,
  "mail": Mail,
  "map-pin": MapPin,
  "message-circle": MessageCircle,
  "minus": Minus,
  "phone": Phone,
  "plus": Plus,
  "quote": Quote,
  "rocket": Rocket,
  "search": Search,
  "settings": Settings,
  "shield-check": ShieldCheck,
  "smartphone": Smartphone,
  "sparkles": Sparkles,
  "star": Star,
  "target": Target,
  "trending-up": TrendingUp,
  "users": Users,
  "wrench": Wrench,
  "zap": Zap,
};

export type IconName = keyof typeof icons;
