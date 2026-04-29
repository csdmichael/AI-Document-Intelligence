// ---------------------------------------------------------------------------
// Bicep template for AI Document Intelligence Tax Form Processing solution
// Provisions: AI Search, App Service (API + UI), RBAC role assignments
//             for managed identity.
// Existing resources (Blob Storage, AI Services, VNet, Cosmos DB) are
// referenced only — not re-created.
// ---------------------------------------------------------------------------

@description('Azure region for new resources')
param location string = resourceGroup().location

@description('Unique suffix for resource names')
param nameSuffix string = 'taxforms'

@description('Existing Storage Account name')
param storageAccountName string = 'aistoragemyaacoub'

@description('Existing AI Services endpoint')
param aiServicesEndpoint string = 'https://001-ai-poc.cognitiveservices.azure.com/'

@description('Existing Cosmos DB account name')
param cosmosAccountName string = 'cosmos-ai-poc'

// ---------------------------------------------------------------------------
// Reference existing Cosmos DB account (not provisioned by this template)
// ---------------------------------------------------------------------------
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: cosmosAccountName
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' existing = {
  parent: cosmosAccount
  name: 'taxforms'
}

// Container 'documents' is created by scripts/setup_cosmos.py to avoid
// throughput limit conflicts with the existing account configuration.

// ---------------------------------------------------------------------------
// Azure AI Search Service
// ---------------------------------------------------------------------------
resource searchService 'Microsoft.Search/searchServices@2024-03-01-preview' = {
  name: 'search-${nameSuffix}'
  location: location
  sku: {
    name: 'free'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http403'
      }
    }
  }
}

// ---------------------------------------------------------------------------
// App Service Plan & API Web App
// ---------------------------------------------------------------------------
resource appPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${nameSuffix}'
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true  // Linux
  }
}

resource apiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'api-${nameSuffix}'
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appPlan.id
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      appCommandLine: 'uvicorn api.app:app --host 0.0.0.0 --port 8000'
      cors: {
        allowedOrigins: [
          'https://ui-${nameSuffix}.azurewebsites.net'
        ]
        supportCredentials: true
      }
      appSettings: [
        { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: storageAccountName }
        { name: 'AZURE_STORAGE_CONTAINER_NAME', value: 'tax-forms' }
        { name: 'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT', value: aiServicesEndpoint }
        { name: 'AZURE_COSMOS_ENDPOINT', value: cosmosAccount.properties.documentEndpoint }
        { name: 'AZURE_COSMOS_DATABASE', value: 'taxforms' }
        { name: 'AZURE_COSMOS_CONTAINER', value: 'documents' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
      ]
    }
    httpsOnly: true
  }
}

// ---------------------------------------------------------------------------
// UI Web App (App Service — same plan as API)
// ---------------------------------------------------------------------------
resource uiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'ui-${nameSuffix}'
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appPlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appCommandLine: 'pm2 serve /home/site/wwwroot --no-daemon --spa'
      appSettings: [
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
      ]
    }
    httpsOnly: true
  }
}

// ---------------------------------------------------------------------------
// RBAC Role Assignments for API Managed Identity
// ---------------------------------------------------------------------------

// Storage Blob Data Contributor on existing storage account
resource existingStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

var storageBlobDataContributorRole = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
resource storageBlobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingStorage.id, apiApp.id, storageBlobDataContributorRole)
  scope: existingStorage
  properties: {
    principalId: apiApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRole)
    principalType: 'ServicePrincipal'
  }
}

// Cognitive Services User on AI Services (Document Intelligence)
var cognitiveServicesUserRole = 'a97b65f3-24c7-4388-baec-2e87135dc908'
resource cognitiveRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, apiApp.id, cognitiveServicesUserRole)
  properties: {
    principalId: apiApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUserRole)
    principalType: 'ServicePrincipal'
  }
}

// Cosmos DB Built-in Data Contributor
var cosmosDataContributorRole = '00000000-0000-0000-0000-000000000002'
resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, apiApp.id, cosmosDataContributorRole)
  properties: {
    principalId: apiApp.identity.principalId
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/${cosmosDataContributorRole}'
    scope: cosmosAccount.id
  }
}

// Search Index Data Contributor
var searchIndexDataContributorRole = '8ebe5a00-799e-43f5-93ac-243d3dce84a7'
resource searchRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(searchService.id, apiApp.id, searchIndexDataContributorRole)
  scope: searchService
  properties: {
    principalId: apiApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchIndexDataContributorRole)
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output apiUrl string = 'https://${apiApp.properties.defaultHostName}'
output searchServiceName string = searchService.name
output staticWebAppUrl string = uiApp.properties.defaultHostName
output apiPrincipalId string = apiApp.identity.principalId
