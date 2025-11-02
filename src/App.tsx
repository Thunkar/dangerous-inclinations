import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box, Typography, Container } from '@mui/material'

const theme = createTheme({
  palette: {
    mode: 'light',
  },
})

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg">
        <Box sx={{ py: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Board Game Simulator
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Ready to implement game mechanics
          </Typography>
        </Box>
      </Container>
    </ThemeProvider>
  )
}

export default App
