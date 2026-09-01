import { type FastifyInstance } from "fastify";

export async function userRoutes(app: FastifyInstance){
  //fetch all the users datasets.
  app.get("/users", async () => {
    return [
      {
        id: 1,
        name: "Milap",
      },
    ];
  });

  //fetch user-based-id with
  app.get("/users/:id", async(request) => {
    const { id } = request.params as {
      id : string;
    };

    return {
      id,
      name: "Milap", 
    };
  });

  //post user
  app.post("/user", async(request, reply) => {
    const body = request.body;
    
    if(!body){
      return reply.code(404).send({error: 'Not Found'})
    }
    return body;
  })

  
interface User {
  id: string;
  name: string;
  role: string;
}

interface RequestParams {
  id: string;
}

// Allows updating any user field except 'id'
type UpdateUserBody = Partial<Omit<User, 'id'>>;

let users: User[] = [
  { id: '1', name: 'Alice', role: 'admin' },
  { id: '2', name: 'Bob', role: 'user' }
];

app.patch<{
  Params: RequestParams;
  Body: UpdateUserBody;
}>('/user/:id', async (request, reply) => {
  const { id } = request.params;
  const body = request.body;

  const userIndex = users.findIndex((u) => u.id === id);

  if (userIndex === -1) {
    return reply.code(404).send({ error: 'User not found' });
  }

  // Merge existing user data with body changes
  users[userIndex] = { ...users[userIndex], ...body };

  return reply.code(200).send(users[userIndex]);
  });
};


