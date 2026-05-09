import { Amplify } from 'aws-amplify'
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito'
import { sessionStorage as ampSessionStorage } from 'aws-amplify/utils'

export function configureAmplify() {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
        signUpVerificationMethod: 'code',
      }
    }
  })
  // Tab-scoped storage so two tabs in the same browser profile can hold two
  // separate Cognito sessions — required for multi-user testing on one
  // machine (otherwise localStorage is shared across tabs and the second
  // login overwrites the first). Tradeoff: closing a tab signs that tab out.
  cognitoUserPoolsTokenProvider.setKeyValueStorage(ampSessionStorage)
}
