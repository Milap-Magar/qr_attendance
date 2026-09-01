
import Fastify from 'fastify';
import { userRoutes } from "./routes/users.ts";

const app = Fastify({ 
  logger: true, 
})

// For heath updates
app.get('/health', async () => {
  return{
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
});

// For breif test screen
app.get("/", async () => {
  return "Health is perfectly fine && nice!"
})

//run the router functions
app.register(userRoutes);

app.listen({
  port: 3000
})
