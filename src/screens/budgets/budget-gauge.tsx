import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { styles } from './budgets.styles';

const gaugeSize = 244;
const gaugeStrokeWidth = 10;
const safeColor = '#31c452';
const warningColor = '#f4b740';
const alertColor = '#ff5a5f';
const warningThresholdRatio = 2 / 3;

export function BudgetGauge({
  alertThreshold,
  isAlert,
  percentage,
}: {
  alertThreshold: number;
  isAlert: boolean;
  percentage: number;
}) {
  const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
  const progressColor = getProgressColor(percentage, alertThreshold, isAlert);
  const radius = (gaugeSize - gaugeStrokeWidth) / 2;
  const center = gaugeSize / 2;
  const progressEnd = getGaugePoint(center, radius, clampedPercentage);
  const progressArc = clampedPercentage <= 0
    ? ''
    : `M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${progressEnd.x} ${progressEnd.y}`;

  return (
    <View style={styles.gaugeWrap}>
      <Svg width={gaugeSize} height={gaugeSize / 2 + gaugeStrokeWidth}>
        <Path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="#777982"
          strokeLinecap="round"
          strokeWidth={gaugeStrokeWidth}
        />
        {progressArc ? (
          <Path
            d={progressArc}
            fill="none"
            stroke={progressColor}
            strokeLinecap="round"
            strokeWidth={gaugeStrokeWidth}
          />
        ) : null}
      </Svg>
    </View>
  );
}

function getProgressColor(percentage: number, alertThreshold: number, isAlert: boolean) {
  if (isAlert) {
    return alertColor;
  }

  if (Number.isFinite(alertThreshold) && percentage >= alertThreshold * warningThresholdRatio) {
    return warningColor;
  }

  return safeColor;
}

function getGaugePoint(center: number, radius: number, percentage: number) {
  const angle = Math.PI - Math.PI * (percentage / 100);

  return {
    x: center + radius * Math.cos(angle),
    y: center - radius * Math.sin(angle),
  };
}
