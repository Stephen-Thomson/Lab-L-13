import { Container, Typography, Box } from '@mui/material'

const CommitmentForm = () => {
  // TODO: Add necessary state variables
  const hostingURL = 'https://staging-overlay.babbage.systems'

  // TODO: Implement form submit handler to publish the file hosting commitment

  return (
    <Container maxWidth="sm">
      <Box mt={5} p={3} border={1} borderRadius={4} borderColor="grey.300">
        <Typography variant="h4" gutterBottom>
          Create File Storage Commitment
        </Typography>
        {/* TODO: Add form for entering file hosting commitment details */}
      </Box>
    </Container>
  )
}

export default CommitmentForm
