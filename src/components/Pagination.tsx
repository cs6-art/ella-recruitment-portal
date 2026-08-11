"use client";

type PaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

function pageItems(page: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const items: Array<number | "ellipsis-left" | "ellipsis-right"> = [1];
  if (page > 3) items.push("ellipsis-left");
  for (let value = Math.max(2, page - 1); value <= Math.min(totalPages - 1, page + 1); value += 1) items.push(value);
  if (page < totalPages - 2) items.push("ellipsis-right");
  items.push(totalPages);
  return items;
}

export default function Pagination({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalItems === 0) return null;

  const currentPage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-summary">Showing {firstItem}-{lastItem} of {totalItems}</span>
      <div className="pagination-controls">
        <button type="button" className="pagination-button pagination-wide-button" disabled={currentPage === 1} onClick={() => onPageChange(1)}>First</button>
        <button type="button" className="pagination-button pagination-wide-button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>Previous</button>
        <div className="pagination-pages">
          {pageItems(currentPage, totalPages).map((item) => item === "ellipsis-left" || item === "ellipsis-right" ? (
            <span className="pagination-ellipsis" key={item}>…</span>
          ) : (
            <button type="button" className={`pagination-button pagination-page-button ${item === currentPage ? "pagination-page-active" : ""}`} aria-current={item === currentPage ? "page" : undefined} aria-label={`Page ${item}`} key={item} onClick={() => onPageChange(item)}>{item}</button>
          ))}
        </div>
        <button type="button" className="pagination-button pagination-wide-button" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)}>Next</button>
        <button type="button" className="pagination-button pagination-wide-button" disabled={currentPage === totalPages} onClick={() => onPageChange(totalPages)}>Last</button>
      </div>
    </nav>
  );
}
