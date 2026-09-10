import json
from unittest.mock import Mock

import fakeredis
import pytest
import redis
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import main


@pytest.fixture(autouse=True)
def storage(monkeypatch):
    client = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(main, "_redis_client", client)
    monkeypatch.setattr(main, "_redis_mode", "test")
    yield client
    client.close()


def test_create_persists_normalized_item(storage):
    item = main.create_item(main.ItemCreate(name=" Leche ", quantity=" 2 l ", note=" Fria "))
    assert item["name"] == "Leche"
    assert item["quantity"] == "2 l"
    assert item["note"] == "Fria"
    assert item["completed"] is False
    assert json.loads(storage.hget(main.REDIS_KEY_ITEMS, item["id"])) == item


def test_list_seeds_once_and_orders_newest_first():
    first = main.get_all_items()
    assert len(first) == len(main.DEFAULT_SAMPLE_ITEMS)
    assert main.get_all_items() == first
    assert [i["createdAt"] for i in first] == sorted((i["createdAt"] for i in first), reverse=True)


def test_list_skips_invalid_json(storage):
    storage.hset(main.REDIS_KEY_ITEMS, "invalid", "{")
    assert main.get_all_items() == []


def test_partial_update_preserves_other_fields():
    item = main.create_item(main.ItemCreate(name="Pan", quantity="2"))
    updated = main.update_item(item["id"], main.ItemUpdate(completed=True))
    assert updated == {**item, "completed": True}
    assert main.update_item(item["id"], main.ItemUpdate(completed=False))["completed"] is False


def test_delete_removes_item(storage):
    item = main.create_item(main.ItemCreate(name="Pan"))
    main.delete_item(item["id"])
    assert not storage.hexists(main.REDIS_KEY_ITEMS, item["id"])


@pytest.mark.parametrize("operation", [lambda: main.update_item("missing", main.ItemUpdate(completed=True)), lambda: main.delete_item("missing")])
def test_missing_item_returns_404(operation):
    with pytest.raises(HTTPException) as exc:
        operation()
    assert exc.value.status_code == 404


def test_clear_only_completed_and_skips_invalid_json(storage):
    pending = main.create_item(main.ItemCreate(name="Pan"))
    done = main.create_item(main.ItemCreate(name="Leche"))
    main.update_item(done["id"], main.ItemUpdate(completed=True))
    storage.hset(main.REDIS_KEY_ITEMS, "invalid", "{")
    assert main.clear_completed_items()["removed_ids"] == [done["id"]]
    assert storage.hexists(main.REDIS_KEY_ITEMS, pending["id"])
    assert main.clear_completed_items()["removed_ids"] == []


def test_health_success():
    assert main.health_check()["redis_connected"] is True


def test_health_connection_failure(monkeypatch):
    monkeypatch.setattr(main, "_redis_client", Mock(ping=Mock(side_effect=redis.ConnectionError("offline"))))
    assert main.health_check()["status"] == "error"


@pytest.mark.parametrize("available", [True, False])
def test_redis_connection_and_fallback(monkeypatch, available):
    monkeypatch.setattr(main, "_redis_client", None)
    real = Mock()
    if not available:
        real.ping.side_effect = redis.ConnectionError("offline")
    monkeypatch.setattr(main.redis, "Redis", Mock(return_value=real))
    client = main.get_redis_client()
    assert (client is real) is available
    assert main.get_redis_client() is client
    if not available:
        assert client.ping()
        client.close()


@pytest.mark.parametrize("payload", [{}, {"name": ""}, {"name": "x" * 101}, {"name": "Pan", "quantity": "x" * 31}])
def test_http_rejects_invalid_input(payload):
    with TestClient(main.app) as client:
        assert client.post("/api/items", json=payload).status_code == 422


def test_http_crud_contract():
    with TestClient(main.app) as client:
        response = client.post("/api/items", json={"name": "Pan"})
        assert response.status_code == 201
        item_id = response.json()["id"]
        assert client.put(f"/api/items/{item_id}", json={"completed": True}).status_code == 200
        assert client.delete("/api/items/completed/clear").json()["removed_ids"] == [item_id]
        assert client.delete(f"/api/items/{item_id}").status_code == 404
