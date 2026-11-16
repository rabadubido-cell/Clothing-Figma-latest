import { handleOperation } from '@/backend/operations/handle-operation'

export async function POST(request: Request) {
  return handleOperation(request)
}
