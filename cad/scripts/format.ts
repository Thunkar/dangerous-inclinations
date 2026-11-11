// Write a generated source file in the repo's Prettier style (.prettierrc.json),
// so what the generators write passes `yarn test`'s format check as it is.
import { writeFileSync } from 'node:fs'
import { format, resolveConfig } from 'prettier'

export async function writeFormatted(file: string, source: string): Promise<void> {
  const options = await resolveConfig(file)
  writeFileSync(file, await format(source, { ...options, filepath: file }))
}
