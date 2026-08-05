from netcrawl import Route, WorkerClass
from netcrawl.runner import _process_injected_fields


class RoutedWorker(WorkerClass):
    route = Route("compute route")


def test_route_sidecar_populates_runtime_nodes_without_becoming_a_worker_field():
    injected = _process_injected_fields(
        RoutedWorker,
        {
            "route": ["e2", "e20"],
            "__netcrawl_route_metadata__": {
                "route": [
                    {"id": "e2", "source": "hub", "target": "ne_relay1"},
                    {"id": "e20", "source": "ne_relay1", "target": "ne_comp1"},
                ]
            },
        },
    )

    assert injected["route"].nodes == ["hub", "ne_relay1", "ne_comp1"]
    assert [str(edge) for edge in injected["route"]] == ["e2", "e20"]
    assert "__netcrawl_route_metadata__" not in injected
