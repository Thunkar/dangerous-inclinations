import { Box, styled } from '@mui/material'
import { Fragment } from 'react'
import type { SlotRegionProps } from './types'

const buttonContainerWidth = 60
const positioningMargin = 5
const trapezoidCorrection = 5
const trapezoidFactor = 50
const trapezoidAngle = 9

const ButtonContainer = styled(Box)({
  position: 'absolute',
  display: 'flex',
  justifyContent: 'space-around',
  margin: 'auto',
  alignItems: 'center',
  overflow: 'visible',
})

const Aft = styled(ButtonContainer)({
  flexDirection: 'column',
  left: 0,
  height: `calc(100% - ${(buttonContainerWidth + positioningMargin) * 2}px)`,
  width: `${buttonContainerWidth}px`,
  top: `${buttonContainerWidth + positioningMargin}px`,
  padding: '0.3rem 0',
  borderRadius: '5px 0px 0px 5px',
})

const AftTrapezoid = styled(Aft, {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ theme, shouldBlur }) => ({
  left: `-${trapezoidCorrection}px`,
  transform: `perspective(${trapezoidFactor}px) rotateY(-${trapezoidAngle}deg)`,
  backgroundColor: theme.palette.action.hover,
  border: `solid ${theme.palette.divider}`,
  borderWidth: '2px 0px 2px 2px',
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
  overflow: 'visible',
}))

const Port = styled(ButtonContainer)({
  top: 0,
  width: `calc(100% - ${(buttonContainerWidth + positioningMargin) * 2}px)`,
  height: `${buttonContainerWidth}px`,
  left: `${buttonContainerWidth + positioningMargin}px`,
  padding: '0 0.2rem',
  borderRadius: '5px 5px 0px 0px',
})

const PortTrapezoid = styled(Port, {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ theme, shouldBlur }) => ({
  top: `-${trapezoidCorrection / 2}px`,
  backgroundColor: theme.palette.action.hover,
  transform: `perspective(${trapezoidFactor}px) rotateX(${trapezoidAngle}deg)`,
  border: `solid ${theme.palette.divider}`,
  borderWidth: '2px 2px 0px 2px',
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
  overflow: 'visible',
}))

const Forward = styled(ButtonContainer)({
  flexDirection: 'column',
  right: 0,
  height: `calc(100% - ${(buttonContainerWidth + positioningMargin) * 2}px)`,
  width: `${buttonContainerWidth}px`,
  top: `${buttonContainerWidth + positioningMargin}px`,
  padding: '0.2rem 0',
  borderRadius: '0px 5px 5px 0px',
})

const ForwardTrapezoid = styled(Forward, {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ theme, shouldBlur }) => ({
  right: `-${trapezoidCorrection}px`,
  backgroundColor: theme.palette.action.hover,
  transform: `perspective(${trapezoidFactor}px) rotateY(${trapezoidAngle}deg)`,
  border: `solid ${theme.palette.divider}`,
  borderWidth: '2px 2px 2px 0px',
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
  overflow: 'visible',
}))

const Starboard = styled(ButtonContainer)({
  bottom: 0,
  width: `calc(100% - ${(buttonContainerWidth + positioningMargin) * 2}px)`,
  height: `${buttonContainerWidth}px`,
  left: `${buttonContainerWidth + positioningMargin}px`,
  padding: '0 0.2rem',
})

const StarboardTrapezoid = styled(Starboard, {
  shouldForwardProp: prop => prop !== 'shouldBlur',
})<{ shouldBlur?: boolean }>(({ theme, shouldBlur }) => ({
  bottom: `-${trapezoidCorrection / 2}px`,
  backgroundColor: theme.palette.action.hover,
  transform: `perspective(${trapezoidFactor}px) rotateX(-${trapezoidAngle}deg)`,
  border: `solid ${theme.palette.divider}`,
  borderWidth: '0px 2px 2px 2px',
  borderRadius: '0px 0px 5px 5px',
  filter: shouldBlur ? 'blur(4px)' : undefined,
  transition: 'filter 0.3s',
  overflow: 'visible',
}))

const VerticalDivider = styled(Box)(({ theme }) => ({
  height: '1px',
  width: '100%',
  backgroundColor: theme.palette.divider,
}))

const HorizontalDivider = styled(Box)(({ theme }) => ({
  width: '1px',
  height: '100%',
  backgroundColor: theme.palette.divider,
}))

const trapezoidComponents = {
  aft: AftTrapezoid,
  port: PortTrapezoid,
  forward: ForwardTrapezoid,
  starboard: StarboardTrapezoid,
}

const containerComponents = {
  aft: Aft,
  port: Port,
  forward: Forward,
  starboard: Starboard,
}

export function SlotRegion({ position, children, shouldBlur }: SlotRegionProps) {
  const TrapezoidComponent = trapezoidComponents[position]
  const ContainerComponent = containerComponents[position]
  const isHorizontal = position === 'port' || position === 'starboard'
  const Divider = isHorizontal ? HorizontalDivider : VerticalDivider

  const childArray = Array.isArray(children) ? children : [children]

  return (
    <>
      <TrapezoidComponent shouldBlur={shouldBlur} />
      <ContainerComponent>
        {childArray.map((child, index) => (
          <Fragment key={index}>
            {child}
            {index !== childArray.length - 1 && <Divider />}
          </Fragment>
        ))}
      </ContainerComponent>
    </>
  )
}
