export interface ApiResponse<T> {
  status: string;
  message?: string;
  data?: T;
  count?: number;
}

export interface UpsertResponseData<T> {
  updatedRecords: string[];
  createdRecords: string[];
  records: T[];
}

export interface UpsertApiResponse<T> extends ApiResponse<UpsertResponseData<T>> {
  data?: UpsertResponseData<T>;
}
