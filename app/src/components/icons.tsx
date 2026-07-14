/**
 * Stroke icons in an SF Symbols spirit: 24-unit grid, 1.8 stroke, round caps.
 */
import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color: string;
  strokeWidth?: number;
}

function base(props: IconProps) {
  return {
    width: props.size ?? 22,
    height: props.size ?? 22,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
  };
}

const s = (props: IconProps) => ({
  stroke: props.color,
  strokeWidth: props.strokeWidth ?? 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function ChipIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Rect x={6} y={6} width={12} height={12} rx={2.5} {...s(props)} />
      <Rect x={9.5} y={9.5} width={5} height={5} rx={1} {...s(props)} />
      <Line x1={9} y1={6} x2={9} y2={3} {...s(props)} />
      <Line x1={12} y1={6} x2={12} y2={3} {...s(props)} />
      <Line x1={15} y1={6} x2={15} y2={3} {...s(props)} />
      <Line x1={9} y1={21} x2={9} y2={18} {...s(props)} />
      <Line x1={12} y1={21} x2={12} y2={18} {...s(props)} />
      <Line x1={15} y1={21} x2={15} y2={18} {...s(props)} />
      <Line x1={6} y1={9} x2={3} y2={9} {...s(props)} />
      <Line x1={6} y1={12} x2={3} y2={12} {...s(props)} />
      <Line x1={6} y1={15} x2={3} y2={15} {...s(props)} />
      <Line x1={21} y1={9} x2={18} y2={9} {...s(props)} />
      <Line x1={21} y1={12} x2={18} y2={12} {...s(props)} />
      <Line x1={21} y1={15} x2={18} y2={15} {...s(props)} />
    </Svg>
  );
}

export function TuneIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Line x1={4} y1={7} x2={20} y2={7} {...s(props)} />
      <Line x1={4} y1={12} x2={20} y2={12} {...s(props)} />
      <Line x1={4} y1={17} x2={20} y2={17} {...s(props)} />
      <Circle cx={9} cy={7} r={2.1} fill={props.color} stroke="none" />
      <Circle cx={15} cy={12} r={2.1} fill={props.color} stroke="none" />
      <Circle cx={7} cy={17} r={2.1} fill={props.color} stroke="none" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path
        d="M4 7.5C4 5.6 5.6 4 7.5 4h9C18.4 4 20 5.6 20 7.5v6c0 1.9-1.6 3.5-3.5 3.5H10l-4.2 3.2c-.5.4-1.3 0-1.3-.6V8.5"
        {...s(props)}
      />
    </Svg>
  );
}

export function LabIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Line x1={4} y1={20} x2={20} y2={20} {...s(props)} />
      <Line x1={7} y1={20} x2={7} y2={13} {...s(props)} strokeWidth={2.6} />
      <Line x1={12} y1={20} x2={12} y2={7} {...s(props)} strokeWidth={2.6} />
      <Line x1={17} y1={20} x2={17} y2={10} {...s(props)} strokeWidth={2.6} />
    </Svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M13 3L5.5 13.5h5L10.5 21 18 10.5h-5L13 3z" {...s(props)} />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M5 12.5l4.5 4.5L19 7.5" {...s(props)} strokeWidth={2.2} />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Line x1={12} y1={4} x2={12} y2={14.5} {...s(props)} />
      <Path d="M7.5 10.5L12 15l4.5-4.5" {...s(props)} />
      <Path d="M5 18.5h14" {...s(props)} />
    </Svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Rect x={7} y={7} width={10} height={10} rx={2} fill={props.color} stroke="none" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M12 19V6" {...s(props)} strokeWidth={2.2} />
      <Path d="M6.5 11L12 5.5 17.5 11" {...s(props)} strokeWidth={2.2} />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M5 7h14" {...s(props)} />
      <Path d="M9.5 7V5.5c0-.8.7-1.5 1.5-1.5h2c.8 0 1.5.7 1.5 1.5V7" {...s(props)} />
      <Path d="M7 7l.8 11.2c.06.9.8 1.8 1.7 1.8h5c.9 0 1.64-.9 1.7-1.8L17 7" {...s(props)} />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" {...s(props)} />
      <Path d="M19.5 4v4h-4" {...s(props)} />
    </Svg>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" {...s(props)} />
      <Path d="M4 7.5l8 4.5 8-4.5" {...s(props)} />
      <Path d="M12 12v9" {...s(props)} />
    </Svg>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3" {...s(props)} />
      <Path d="M4.5 12V7.5" {...s(props)} />
      <Path d="M4.5 12H9" {...s(props)} />
      <Path d="M12 8.5V12l2.8 2" {...s(props)} />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Line x1={12} y1={5} x2={12} y2={19} {...s(props)} strokeWidth={2} />
      <Line x1={5} y1={12} x2={19} y2={12} {...s(props)} strokeWidth={2} />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Line x1={6.5} y1={6.5} x2={17.5} y2={17.5} {...s(props)} strokeWidth={2} />
      <Line x1={17.5} y1={6.5} x2={6.5} y2={17.5} {...s(props)} strokeWidth={2} />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Rect x={8.5} y={8.5} width={11} height={11} rx={2.5} {...s(props)} />
      <Path d="M15.5 5.5A1.5 1.5 0 0 0 14 4H6a2 2 0 0 0-2 2v8a1.5 1.5 0 0 0 1.5 1.5" {...s(props)} />
    </Svg>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M8.5 8L4 12l4.5 4" {...s(props)} />
      <Path d="M15.5 8L20 12l-4.5 4" {...s(props)} />
      <Line x1={13.5} y1={5} x2={10.5} y2={19} {...s(props)} />
    </Svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path
        d="M12 4l1.8 4.6L18.5 10l-4.7 1.4L12 16l-1.8-4.6L5.5 10l4.7-1.4L12 4z"
        {...s(props)}
      />
      <Path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" {...s(props)} strokeWidth={1.4} />
    </Svg>
  );
}
