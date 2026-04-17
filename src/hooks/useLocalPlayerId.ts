import { useMemo } from "react";
import { generatePlayerId } from "../firebase/roomService";

const STORAGE_KEY = "boxcount_player_id";

export function readLocalPlayerId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = generatePlayerId();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function useLocalPlayerId(): string {
  return useMemo(() => readLocalPlayerId(), []);
}
