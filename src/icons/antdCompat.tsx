import type { ComponentProps, CSSProperties } from 'react'
import {
  Airplay,
  Alarm,
  AppWindow,
  Archive,
  ArrowClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  ArrowsIn,
  ArrowsOutCardinal,
  Bell,
  BookOpen,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Certificate,
  ChartBar,
  ChartLine,
  ChartLineUp,
  Check,
  CheckCircle,
  Circle,
  Clock,
  ClockCounterClockwise,
  CloudArrowDown,
  CloudArrowUp,
  Code,
  Coffee,
  Copy,
  Crosshair,
  Database,
  DownloadSimple,
  DotsThree,
  DotsThreeVertical,
  Eraser,
  Export,
  Eye,
  EyeSlash,
  File,
  FileAudio,
  FileImage,
  FileText,
  Fire,
  FloppyDisk,
  FolderOpen,
  Funnel,
  Gauge,
  GearSix,
  GlobeHemisphereWest,
  HandGrabbing,
  Heart,
  Image,
  Info,
  Lightning,
  Link,
  List,
  Lock,
  MagicWand,
  MagnifyingGlass,
  Microphone,
  Minus,
  MusicNote,
  NotePencil,
  PauseCircle,
  PencilSimple,
  PlayCircle,
  Plus,
  Question,
  RadioButton,
  Robot,
  RocketLaunch,
  Rows,
  Scissors,
  SealCheck,
  ShieldCheck,
  ShieldChevron,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smiley,
  Sparkle,
  Star,
  StarHalf,
  Stop,
  TextB,
  TextColumns,
  ThumbsDown,
  ThumbsUp,
  Trash,
  TrendUp,
  Trophy,
  UploadSimple,
  User,
  UsersThree,
  Warning,
  WarningCircle,
  Waveform,
  Wrench,
  X,
  XCircle,
} from '@phosphor-icons/react'

type BaseIconProps = ComponentProps<typeof X>
type IconProps = BaseIconProps & { spin?: boolean }

function icon(Component: typeof X) {
  return function CompatIcon(props: IconProps) {
    const { spin, style, ...rest } = props
    const spinStyle: CSSProperties | undefined = spin
      ? { animation: 'spin 1s linear infinite', ...style }
      : style
    return <Component size="1em" weight="bold" style={spinStyle} {...rest} />
  }
}

export const AimOutlined = icon(Crosshair)
export const AlertOutlined = icon(Warning)
export const ApiOutlined = icon(Code)
export const AppstoreOutlined = icon(AppWindow)
export const ArrowDownOutlined = icon(ArrowDown)
export const ArrowLeftOutlined = icon(ArrowLeft)
export const ArrowRightOutlined = icon(ArrowRight)
export const AudioFileOutlined = icon(FileAudio)
export const AudioOutlined = icon(Microphone)
export const BarChartOutlined = icon(ChartBar)
export const BellOutlined = icon(Bell)
export const BookOutlined = icon(BookOpen)
export const BulbOutlined = icon(Sparkle)
export const CalendarOutlined = icon(CalendarBlank)
export const CaretDownOutlined = icon(CaretDown)
export const CaretLeftOutlined = icon(CaretLeft)
export const CaretRightOutlined = icon(CaretRight)
export const CaretUpOutlined = icon(CaretUp)
export const CheckCircleFilled = icon(SealCheck)
export const CheckCircleOutlined = icon(CheckCircle)
export const CheckOutlined = icon(Check)
export const ClearOutlined = icon(Eraser)
export const ClockCircleOutlined = icon(Clock)
export const CloseCircleOutlined = icon(XCircle)
export const CloseOutlined = icon(X)
export const CloudDownloadOutlined = icon(CloudArrowDown)
export const CloudUploadOutlined = icon(CloudArrowUp)
export const CodeOutlined = icon(Code)
export const CoffeeOutlined = icon(Coffee)
export const ColumnOutlined = icon(TextColumns)
export const CompressOutlined = icon(ArrowsIn)
export const CopyOutlined = icon(Copy)
export const DashboardOutlined = icon(Gauge)
export const DatabaseOutlined = icon(Database)
export const DeleteOutlined = icon(Trash)
export const DislikeOutlined = icon(ThumbsDown)
export const DownOutlined = icon(ArrowDown)
export const DownloadOutlined = icon(DownloadSimple)
export const DragOutlined = icon(ArrowsOutCardinal)
export const EditOutlined = icon(PencilSimple)
export const ExclamationCircleOutlined = icon(WarningCircle)
export const ExperimentOutlined = icon(SlidersHorizontal)
export const ExpandOutlined = icon(ArrowsOutCardinal)
export const ExportOutlined = icon(Export)
export const ExportSquareOutlined = icon(ArrowSquareOut)
export const EyeInvisibleOutlined = icon(EyeSlash)
export const EyeOutlined = icon(Eye)
export const FieldTimeOutlined = icon(Alarm)
export const FileImageOutlined = icon(FileImage)
export const FileOutlined = icon(File)
export const FileTextOutlined = icon(FileText)
export const FilterOutlined = icon(Funnel)
export const FireOutlined = icon(Fire)
export const FolderOpenOutlined = icon(FolderOpen)
export const FormatBoldOutlined = icon(TextB)
export const ForwardOutlined = icon(ArrowRight)
export const GlobalOutlined = icon(GlobeHemisphereWest)
export const HeartOutlined = icon(Heart)
export const HistoryOutlined = icon(ClockCounterClockwise)
export const HolderOutlined = icon(HandGrabbing)
export const HomeOutlined = icon(Airplay)
export const ImageOutlined = icon(Image)
export const ImportOutlined = icon(UploadSimple)
export const InboxOutlined = icon(Archive)
export const InfoCircleOutlined = icon(Info)
export const LeftOutlined = icon(ArrowLeft)
export const LikeOutlined = icon(ThumbsUp)
export const LineChartOutlined = icon(ChartLine)
export const LinkOutlined = icon(Link)
export const LoadingOutlined = icon(ArrowsClockwise)
export const LockOutlined = icon(Lock)
export const MagicOutlined = icon(MagicWand)
export const MenuOutlined = icon(List)
export const MinusOutlined = icon(Minus)
export const MoreOutlined = icon(DotsThree)
export const MoreOutlinedVertical = icon(DotsThreeVertical)
export const MusicOutlined = icon(MusicNote)
export const NotePencilOutlined = icon(NotePencil)
export const PauseCircleOutlined = icon(PauseCircle)
export const PlayCircleOutlined = icon(PlayCircle)
export const PlusOutlined = icon(Plus)
export const QuestionCircleOutlined = icon(Question)
export const RedoOutlined = icon(ArrowClockwise)
export const ReloadOutlined = icon(ArrowClockwise)
export const RightOutlined = icon(ArrowRight)
export const RiseOutlined = icon(ChartLineUp)
export const RobotOutlined = icon(Robot)
export const RocketOutlined = icon(RocketLaunch)
export const SafetyCertificateOutlined = icon(Certificate)
export const SaveOutlined = icon(FloppyDisk)
export const ScissorOutlined = icon(Scissors)
export const SearchOutlined = icon(MagnifyingGlass)
export const SettingOutlined = icon(GearSix)
export const ShieldCheckOutlined = icon(ShieldCheck)
export const ShieldChevronOutlined = icon(ShieldChevron)
export const SmileOutlined = icon(Smiley)
export const SoundOutlined = icon(Waveform)
export const StarFilled = icon(Star)
export const StarOutlined = icon(StarHalf)
export const StepBackwardOutlined = icon(SkipBack)
export const ToolOutlined = icon(Wrench)
export const StepForwardOutlined = icon(SkipForward)
export const StopOutlined = icon(Stop)
export const SyncOutlined = icon(ArrowsClockwise)
export const TagOutlined = icon(RadioButton)
export const TeamOutlined = icon(UsersThree)
export const ThunderboltOutlined = icon(Lightning)
export const TrendUpOutlined = icon(TrendUp)
export const TrophyOutlined = icon(Trophy)
export const UndoOutlined = icon(ArrowClockwise)
export const UnlockOutlined = icon(Lock)
export const UnorderedListOutlined = icon(Rows)
export const UpOutlined = icon(CaretUp)
export const UploadOutlined = icon(UploadSimple)
export const UserOutlined = icon(User)
export const WarningOutlined = icon(Warning)

export default Circle
