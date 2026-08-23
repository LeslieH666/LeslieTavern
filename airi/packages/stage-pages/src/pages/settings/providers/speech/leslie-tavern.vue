<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import {
  Alert,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { selectProviderMetadata } from '@proj-airi/stage-ui/libs/providers/metadata'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button } from '@proj-airi/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const providerId = 'leslie-tavern'
const { t } = useI18n()
const router = useRouter()
const providerConfigStore = useProviderConfigStore()
const providersStore = useProviderStore()

const isValidating = ref(false)
const isValid = ref(false)
const validationMessage = ref('')
const providerMetadata = computed(() => selectProviderMetadata(
  providersStore.getProviderDefinition(providerId),
  t,
  { id: providerId },
))

async function validateConnection() {
  providersStore.initializeProvider(providerId)
  providerConfigStore.setProviderStatus(providerId, 'validating')
  isValidating.value = true
  isValid.value = false
  validationMessage.value = ''

  try {
    const config = providerConfigStore.getProviderConfig(providerId) ?? {}
    const result = await providersStore.validateProviderConfig(providerId, config)
    isValid.value = result.valid
    validationMessage.value = result.reason
    providerConfigStore.setProviderStatus(providerId, result.valid ? 'configured' : 'invalid')

    if (result.valid) {
      providerConfigStore.markProviderAdded(providerId)
      await providersStore.fetchModelsForProvider(providerId)
    }
  }
  catch (error) {
    validationMessage.value = errorMessageFrom(error) ?? 'Leslie Bridge validation failed.'
    providerConfigStore.setProviderStatus(providerId, 'invalid')
  }
  finally {
    isValidating.value = false
  }
}

onMounted(validateConnection)
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata.localizedName"
    :provider-icon="providerMetadata.icon"
    :provider-icon-color="providerMetadata.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.provider.leslie-tavern.connection.title')"
        :description="t('settings.pages.providers.provider.leslie-tavern.connection.description')"
      >
        <div class="flex flex-col gap-3 text-sm text-neutral-500 dark:text-neutral-400">
          <p>{{ t('settings.pages.providers.provider.leslie-tavern.connection.environment') }}</p>
          <Button size="sm" :loading="isValidating" :disabled="isValidating" @click="validateConnection">
            {{ t('settings.pages.providers.catalog.edit.validators.actions.validate') }}
          </Button>
        </div>
      </ProviderBasicSettings>

      <Alert v-if="isValidating" type="loading">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationRunning') }}
        </template>
      </Alert>
      <Alert v-else-if="isValid" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
        <template #content>
          <button class="text-primary-600 dark:text-primary-400" type="button" @click="router.push('/settings/modules/speech')">
            {{ t('settings.pages.providers.common.goToModelSelection') }}
          </button>
        </template>
      </Alert>
      <Alert v-else-if="validationMessage" type="error">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationFailed') }}
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
