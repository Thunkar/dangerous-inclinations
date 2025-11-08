import { Box } from '@mui/material'

interface CustomIconProps {
  icon: string
  size?: number
}

const ICON_MAP: Record<string, string> = {
  engines: '/assets/icons/thrusters.png',
  rotation: '/assets/icons/maneuvering_thrusters.png',
  scoop: '/assets/icons/antenna.png',
  laser: '/assets/icons/laser.png',
  railgun: '/assets/icons/plasma_cannons.png',
  missiles: '/assets/icons/ballistic_rack.png',
  shields: '/assets/icons/shield.png',
  energy: '/assets/icons/energy.png',
  heat: '/assets/icons/heat.png',
}

export function CustomIcon({ icon, size = 24 }: CustomIconProps) {
  const iconPath = ICON_MAP[icon] || '/assets/icons/energy.png'

  return (
    <Box
      component="img"
      src={iconPath}
      alt={icon}
      sx={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain',
        filter: 'brightness(0) invert(1)', // Make icons white
      }}
    />
  )
}
