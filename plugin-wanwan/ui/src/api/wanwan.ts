import { axiosInstance } from '@halo-dev/api-client'
import type { ExtensionList, ResourceCard, Topic } from '@/types/wanwan'

const RESOURCE_BASE = '/apis/wanwan.run/v1alpha1/resourcecards'
const TOPIC_BASE = '/apis/wanwan.run/v1alpha1/topics'

export async function listResourceCards(page = 1, size = 100): Promise<ExtensionList<ResourceCard>> {
  const { data } = await axiosInstance.get<ExtensionList<ResourceCard>>(RESOURCE_BASE, {
    params: { page, size },
  })
  return data
}

export async function createResourceCard(card: ResourceCard): Promise<ResourceCard> {
  const { data } = await axiosInstance.post<ResourceCard>(RESOURCE_BASE, card)
  return data
}

export async function updateResourceCard(card: ResourceCard): Promise<ResourceCard> {
  const { data } = await axiosInstance.put<ResourceCard>(
    `${RESOURCE_BASE}/${encodeURIComponent(card.metadata.name)}`,
    card,
  )
  return data
}

export async function deleteResourceCard(name: string): Promise<void> {
  await axiosInstance.delete(`${RESOURCE_BASE}/${encodeURIComponent(name)}`)
}

export async function listTopics(page = 1, size = 100): Promise<ExtensionList<Topic>> {
  const { data } = await axiosInstance.get<ExtensionList<Topic>>(TOPIC_BASE, {
    params: { page, size },
  })
  return data
}

export async function createTopic(topic: Topic): Promise<Topic> {
  const { data } = await axiosInstance.post<Topic>(TOPIC_BASE, topic)
  return data
}

export async function updateTopic(topic: Topic): Promise<Topic> {
  const { data } = await axiosInstance.put<Topic>(
    `${TOPIC_BASE}/${encodeURIComponent(topic.metadata.name)}`,
    topic,
  )
  return data
}

export async function deleteTopic(name: string): Promise<void> {
  await axiosInstance.delete(`${TOPIC_BASE}/${encodeURIComponent(name)}`)
}
