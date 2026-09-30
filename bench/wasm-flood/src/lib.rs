//! Bounded WASM spike (perf research W4): flood-fill core vs the TS implementation in
//! `src/engine/floodfill.ts`. Raw `wasm32-unknown-unknown` cdylib, no bindings — the vitest bench
//! (`src/engine/flood-wasm.bench.ts`) instantiates the module and talks to it through its exports.
//!
//! Build:
//!   cd bench/wasm-flood && cargo build --release --target wasm32-unknown-unknown
//! → target/wasm32-unknown-unknown/release/flood_wasm.wasm
//!
//! Memory layout: `init(len)` allocates two `len`-cell scratch buffers (cells at the returned
//! pointer, pristine right after) and leaks them on purpose — the bench owns the lifetime.
#![allow(static_mut_refs)]

static mut CELLS: *mut u16 = std::ptr::null_mut();
static mut PRISTINE: *mut u16 = std::ptr::null_mut();
static mut LEN: usize = 0;

/// Allocate the scratch pair; returns the pointer to the working cells buffer.
#[no_mangle]
pub extern "C" fn init(len: usize) -> *mut u16 {
    let mut cells: Vec<u16> = vec![0; len];
    let mut pristine: Vec<u16> = vec![0; len];
    let cp = cells.as_mut_ptr();
    let pp = pristine.as_mut_ptr();
    std::mem::forget(cells);
    std::mem::forget(pristine);
    unsafe {
        CELLS = cp;
        PRISTINE = pp;
        LEN = len;
    }
    cp
}

/// Byte offset of the pristine copy (the bench seeds both buffers itself).
#[no_mangle]
pub extern "C" fn pristine_offset() -> *mut u16 {
    unsafe { PRISTINE }
}

/// pristine → cells copy (the reset a bench iteration pays before re-flooding).
#[no_mangle]
pub extern "C" fn restore() {
    unsafe { std::ptr::copy_nonoverlapping(PRISTINE, CELLS, LEN) };
}

/// 4-neighbour flood fill over the working buffer; returns the region size.
#[no_mangle]
pub extern "C" fn flood(bw: usize, start: usize, value: u16) -> usize {
    unsafe {
        let len = LEN;
        let cells = std::slice::from_raw_parts_mut(CELLS, len);
        let target = cells[start];
        if target == value {
            return 0;
        }
        let mut visited = vec![0u8; len];
        let mut stack: Vec<usize> = Vec::with_capacity(4096);
        stack.push(start);
        visited[start] = 1;
        let mut count = 0usize;
        while let Some(i) = stack.pop() {
            count += 1;
            let x = i % bw;
            let mut step = |j: usize, visited: &mut [u8], stack: &mut Vec<usize>| {
                if visited[j] == 0 && cells[j] == target {
                    visited[j] = 1;
                    stack.push(j);
                }
            };
            if x > 0 {
                step(i - 1, &mut visited, &mut stack);
            }
            if x + 1 < bw {
                step(i + 1, &mut visited, &mut stack);
            }
            if i >= bw {
                step(i - bw, &mut visited, &mut stack);
            }
            if i + bw < len {
                step(i + bw, &mut visited, &mut stack);
            }
        }
        for (k, seen) in visited.iter().enumerate() {
            if *seen != 0 {
                cells[k] = value;
            }
        }
        count
    }
}

/// restore + flood in one call — what a re-runnable bench iteration costs end to end.
#[no_mangle]
pub extern "C" fn flood_fresh(bw: usize, start: usize, value: u16) -> usize {
    restore();
    flood(bw, start, value)
}
