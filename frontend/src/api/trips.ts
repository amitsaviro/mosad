import { api } from '@/api/client';
import {
  MealType,
  Trip,
  TripContact,
  TripDocument,
  TripEquipmentItem,
  TripScheduleItem,
  TripShoppingItem,
  TripSummary,
} from '@/types';

export type TripInput = {
  name: string;
  destination?: string;
  start_date: string; // "YYYY-MM-DD"
  end_date?: string;
  notes?: string;
  share_layer_ids?: string[];
};

export function listTrips(layerId: string) {
  return api.get<TripSummary[]>(`/layers/${layerId}/trips`);
}

export function createTrip(layerId: string, payload: TripInput) {
  return api.post<TripSummary>(`/layers/${layerId}/trips`, payload);
}

export function getTrip(tripId: string) {
  return api.get<Trip>(`/trips/${tripId}`);
}

export function updateTrip(tripId: string, payload: Partial<TripInput>) {
  return api.patch<Trip>(`/trips/${tripId}`, payload);
}

export function deleteTrip(tripId: string) {
  return api.delete<void>(`/trips/${tripId}`);
}

export function addTripEquipmentItem(tripId: string, label: string) {
  return api.post<TripEquipmentItem>(`/trips/${tripId}/equipment`, { label });
}

export function toggleTripEquipmentItem(tripId: string, itemId: string, checked: boolean) {
  return api.patch<TripEquipmentItem>(`/trips/${tripId}/equipment/${itemId}`, { checked });
}

export function deleteTripEquipmentItem(tripId: string, itemId: string) {
  return api.delete<void>(`/trips/${tripId}/equipment/${itemId}`);
}

export function addTripShoppingItem(tripId: string, label: string) {
  return api.post<TripShoppingItem>(`/trips/${tripId}/shopping`, { label });
}

export function toggleTripShoppingItem(tripId: string, itemId: string, checked: boolean) {
  return api.patch<TripShoppingItem>(`/trips/${tripId}/shopping/${itemId}`, { checked });
}

export function deleteTripShoppingItem(tripId: string, itemId: string) {
  return api.delete<void>(`/trips/${tripId}/shopping/${itemId}`);
}

export function addTripDocument(tripId: string, label: string, url: string) {
  return api.post<TripDocument>(`/trips/${tripId}/documents`, { label, url });
}

export function deleteTripDocument(tripId: string, documentId: string) {
  return api.delete<void>(`/trips/${tripId}/documents/${documentId}`);
}

export type TripScheduleItemInput = {
  time?: string; // "HH:MM:SS"
  title: string;
  notes?: string;
};

export function addTripScheduleItem(tripId: string, payload: TripScheduleItemInput) {
  return api.post<TripScheduleItem>(`/trips/${tripId}/schedule`, payload);
}

export function updateTripScheduleItem(tripId: string, itemId: string, payload: Partial<TripScheduleItemInput>) {
  return api.patch<TripScheduleItem>(`/trips/${tripId}/schedule/${itemId}`, payload);
}

export function deleteTripScheduleItem(tripId: string, itemId: string) {
  return api.delete<void>(`/trips/${tripId}/schedule/${itemId}`);
}

export function setTripConfirmation(tripId: string, participantId: string, confirmed: boolean) {
  return api.patch<void>(`/trips/${tripId}/confirmations/${participantId}`, { confirmed });
}

export function addTripContact(tripId: string, label: string, phone: string) {
  return api.post<TripContact>(`/trips/${tripId}/contacts`, { label, phone });
}

export function deleteTripContact(tripId: string, contactId: string) {
  return api.delete<void>(`/trips/${tripId}/contacts/${contactId}`);
}

export function setTripMeal(tripId: string, date: string, mealType: MealType, description: string) {
  return api.put<void>(`/trips/${tripId}/meals`, { date, meal_type: mealType, description });
}

export function shareTrip(tripId: string, layerId: string) {
  return api.post<void>(`/trips/${tripId}/share`, { layer_id: layerId });
}

export function unshareTrip(tripId: string, layerId: string) {
  return api.delete<void>(`/trips/${tripId}/share/${layerId}`);
}
