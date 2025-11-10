import { Box, Typography, Alert, styled, Button } from '@mui/material'
import { CustomIcon } from '../CustomIcon'

interface ActionSummaryProps {
  validationErrors: string[]
  warnings?: string[]
  onExecute: () => void
}

const Container = styled(Box)(({ theme }) => ({
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}))

const ExecuteButton = styled(Button)(() => ({
  width: '100%',
  padding: '12px',
  fontSize: '1rem',
  fontWeight: 'bold',
  marginTop: '8px',
  transition: 'all 0.2s',
  '&:hover': {
    transform: 'scale(1.02)',
  },
}))

export function ActionSummary({ validationErrors, warnings = [], onExecute }: ActionSummaryProps) {
  const hasErrors = validationErrors.length > 0
  const hasWarnings = warnings.length > 0

  return (
    <Container>
      {hasErrors && (
        <Alert severity="error" sx={{ mb: 2, py: 0.5 }}>
          {validationErrors.map((error, i) => (
            <Typography key={i} variant="caption" component="div" sx={{ lineHeight: 1.4 }}>
              • {error}
            </Typography>
          ))}
        </Alert>
      )}

      {hasWarnings && (
        <Alert severity="warning" sx={{ mb: 2, py: 0.5 }}>
          {warnings.map((warning, i) => (
            <Typography key={i} variant="caption" component="div" sx={{ lineHeight: 1.4 }}>
              • {warning}
            </Typography>
          ))}
        </Alert>
      )}

      <ExecuteButton
        variant="contained"
        color="primary"
        size="large"
        onClick={onExecute}
        disabled={hasErrors}
        startIcon={<CustomIcon icon="energy" size={16} />}
      >
        Execute Turn
      </ExecuteButton>
    </Container>
  )
}
