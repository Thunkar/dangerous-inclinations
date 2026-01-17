import type { SubsystemType } from '@dangerous-inclinations/engine'

export const SUBSYSTEM_ICONS: Partial<Record<SubsystemType, string>> = {
  engines: '/assets/icons/thrusters.png',
  rotation: '/assets/icons/maneuvering_thrusters.png',
  scoop: '/assets/icons/scoop.png',
  railgun: '/assets/icons/railgun.png',
  sensor_array: '/assets/icons/antenna.png',
  laser: '/assets/icons/laser.png',
  shields: '/assets/icons/shield.png',
  radiator: '/assets/icons/heat.png',
  fuel_tank: '/assets/icons/fuel.png',
  missiles: '/assets/icons/missile_rack.png',
}

export function getSubsystemIcon(type: SubsystemType): string | undefined {
  return SUBSYSTEM_ICONS[type]
}
